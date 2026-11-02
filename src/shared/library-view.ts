import type { GameSummary } from './ipc/contract'

/**
 * Library search, filters and sorting (PRODUCT.md §6.4). Pure functions over
 * the summaries the renderer already holds; the view lives in memory, keeps
 * its value while navigating and resets when the app restarts.
 */

export type LibrarySort = 'title' | 'recent' | 'playtime'
/** "Unknown" install states only appear under `all`: they are not reliable. */
export type InstallFilter = 'all' | 'installed' | 'missing'

export interface LibraryView {
  query: string
  /** Origin key; null = every origin. */
  origin: string | null
  install: InstallFilter
  showHidden: boolean
  /** Only games marked as beaten ("zerados"). */
  beatenOnly: boolean
  sort: LibrarySort
}

export const DEFAULT_LIBRARY_VIEW: LibraryView = {
  query: '',
  origin: null,
  install: 'all',
  showHidden: false,
  beatenOnly: false,
  sort: 'title'
}

/** True when anything narrows the list (sorting does not). */
export function isFiltered(view: LibraryView): boolean {
  return (
    view.query.trim() !== '' ||
    view.origin !== null ||
    view.install !== 'all' ||
    view.showHidden ||
    view.beatenOnly
  )
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

const SORTS: Record<LibrarySort, (a: GameSummary, b: GameSummary) => number> = {
  title: byTitle,
  recent: byRecent,
  playtime: (a, b) => b.playtime - a.playtime || byTitle(a, b)
}

export function applyLibraryView(games: readonly GameSummary[], view: LibraryView): GameSummary[] {
  const words = searchKey(view.query).split(' ').filter(Boolean)
  return games
    .filter((game) => {
      if (game.hidden && !view.showHidden) return false
      if (view.origin !== null && game.origin !== view.origin) return false
      if (view.install === 'installed' && game.installed !== true) return false
      if (view.install === 'missing' && game.installed !== false) return false
      if (view.beatenOnly && !game.beated) return false
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
