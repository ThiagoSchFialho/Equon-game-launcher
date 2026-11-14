import type { GameSummary } from './ipc/contract'

/**
 * Library search, filters and sorting (PRODUCT.md §6.4). Pure functions over
 * the summaries the renderer already holds; the view lives in memory, keeps
 * its value while navigating and resets when the app restarts.
 */

/** "Ocultos" and "Zerados" are filters only, not sorts (owner decision). */
export type LibrarySort = 'title' | 'recent' | 'playtime' | 'achievements' | 'origin' | 'install'
/**
 * The filters add up (owner decision): each one that is on narrows the list further, so
 * "Instalados" with "Não instalados" shows nothing.
 */
export interface LibraryView {
  query: string
  /** Origin key; null = every origin. */
  origin: string | null
  /** "Ocultos": only hidden games. Off, hidden games stay out of the list. */
  hiddenOnly: boolean
  /** "Zerados": only games marked as beaten. */
  beatenOnly: boolean
  /** "Instalados": only games known to be installed. */
  installedOnly: boolean
  /**
   * "Não instalados": only games confirmed not installed. Unknown install states only appear
   * with neither install filter on: they are not reliable.
   */
  notInstalledOnly: boolean
  sort: LibrarySort
}

export const DEFAULT_LIBRARY_VIEW: LibraryView = {
  query: '',
  origin: null,
  hiddenOnly: false,
  beatenOnly: false,
  installedOnly: false,
  notInstalledOnly: false,
  sort: 'title'
}

/** True when anything narrows the list (sorting does not). */
export function isFiltered(view: LibraryView): boolean {
  return view.query.trim() !== '' || activeFilterCount(view) > 0
}

/** How many options of the filters dialog are on; the search has its own field. */
export function activeFilterCount(view: LibraryView): number {
  return [
    view.origin !== null,
    view.hiddenOnly,
    view.beatenOnly,
    view.installedOnly,
    view.notInstalledOnly
  ].filter(Boolean).length
}

/** Case-, accent- and punctuation-insensitive form used by the search. */
export function searchKey(text: string): string {
  return text
    .replace(/[™®©]/g, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
const byTitle = (a: GameSummary, b: GameSummary): number =>
  collator.compare(a.title, b.title) || a.id - b.id

/** Most recent session first; never-played games last, by title. */
const byRecent = (a: GameSummary, b: GameSummary): number => {
  if (a.timeLastPlayed === b.timeLastPlayed) return byTitle(a, b)
  if (a.timeLastPlayed === null) return 1
  if (b.timeLastPlayed === null) return -1
  return b.timeLastPlayed.localeCompare(a.timeLastPlayed)
}

/** Highest percentage first; games without known achievements last, after a real 0%. */
const byAchievements = (a: GameSummary, b: GameSummary): number => {
  if (a.achievementPercent === b.achievementPercent) return byTitle(a, b)
  if (a.achievementPercent === null) return 1
  if (b.achievementPercent === null) return -1
  return b.achievementPercent - a.achievementPercent
}

/** Installed, then unknown, then not installed. */
const installRank = (game: GameSummary): number =>
  game.installed === true ? 0 : game.installed === null ? 1 : 2

const SORTS: Record<LibrarySort, (a: GameSummary, b: GameSummary) => number> = {
  title: byTitle,
  recent: byRecent,
  playtime: (a, b) => b.playtime - a.playtime || byTitle(a, b),
  achievements: byAchievements,
  origin: (a, b) => collator.compare(a.originName, b.originName) || byTitle(a, b),
  install: (a, b) => installRank(a) - installRank(b) || byTitle(a, b)
}

export function applyLibraryView(games: readonly GameSummary[], view: LibraryView): GameSummary[] {
  const words = searchKey(view.query).split(' ').filter(Boolean)
  return games
    .filter((game) => {
      if (game.hidden !== view.hiddenOnly) return false
      if (view.origin !== null && game.origin !== view.origin) return false
      if (view.beatenOnly && !game.beated) return false
      if (view.installedOnly && game.installed !== true) return false
      if (view.notInstalledOnly && game.installed !== false) return false
      if (words.length === 0) return true
      const title = searchKey(game.title)
      return words.every((word) => title.includes(word))
    })
    .sort(SORTS[view.sort])
}

/** Home (fixed, not user-configurable): every installed, non-hidden game, most recent session first. */
export function homeGames(games: readonly GameSummary[]): GameSummary[] {
  return games.filter((g) => g.installed === true && !g.hidden).sort(byRecent)
}

/**
 * The letter a title files under when sorted by title (owner decision): its first letter without
 * accents ("Á" → "A"), or "#" for a number or a symbol.
 */
export function titleInitial(title: string): string {
  const first = title.trim().normalize('NFD').charAt(0).toUpperCase()
  return /^[A-Z]$/.test(first) ? first : '#'
}

/**
 * Sorted by playtime, the band the focused game is in (owner decisions): "0h", ">0h" under an
 * hour, ">1h" … ">9h" hour by hour, ">10h" … ">90h" in steps of 10 hours, and ">100h" from 100
 * hours up.
 */
export function playtimeBand(minutes: number): string {
  if (minutes <= 0) return '0h'
  const hours = minutes / 60
  if (hours >= 100) return '>100h'
  if (hours < 10) return `>${Math.floor(hours)}h`
  return `>${Math.floor(hours / 10) * 10}h`
}

/**
 * Sorted by achievements, the band of the focused game (owner decisions): "100%", ">90%" …
 * ">10%" in steps of 10, then ">5%", ">1%", ">0%" under 1%, and "0%"; null for a game with no
 * known achievements.
 */
export function achievementBand(percent: number | null): string | null {
  if (percent === null) return null
  if (percent >= 100) return '100%'
  if (percent <= 0) return '0%'
  if (percent < 1) return '>0%'
  if (percent < 5) return '>1%'
  if (percent < 10) return '>5%'
  return `>${Math.floor(percent / 10) * 10}%`
}

/**
 * What the Library's left margin shows for the focused game (owner decision): its letter by
 * title, its band by playtime or by achievements; nothing for the other sorts.
 */
export function libraryMarker(game: GameSummary, sort: LibrarySort): string | null {
  if (sort === 'title') return titleInitial(game.title)
  if (sort === 'playtime') return playtimeBand(game.playtime)
  if (sort === 'achievements') return achievementBand(game.achievementPercent)
  return null
}
