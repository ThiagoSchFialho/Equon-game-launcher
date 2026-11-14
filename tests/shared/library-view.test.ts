import { describe, expect, it } from 'vitest'
import type { GameSummary } from '../../src/shared/ipc/contract'
import {
  DEFAULT_LIBRARY_VIEW,
  activeFilterCount,
  applyLibraryView,
  homeGames,
  isFiltered,
  searchKey,
  achievementBand,
  playtimeBand,
  titleInitial,
  type LibraryView
} from '../../src/shared/library-view'

const game = (id: number, title: string, extra: Partial<GameSummary> = {}): GameSummary => ({
  id,
  title,
  origin: 'manual',
  originName: 'Jogo Local',
  installed: true,
  playtime: 0,
  timeLastPlayed: null,
  beated: false,
  hidden: false,
  artwork: [],
  artworkVersion: null,
  achievementPercent: null,
  ...extra
})

const games = [
  game(1, 'Zelda', { origin: 'yuzu', timeLastPlayed: '2026-10-01T10:00:00Z', playtime: 30 }),
  game(2, 'Pokémon™: Red', { installed: false, playtime: 300 }),
  game(3, 'assassin’s creed', { installed: null, timeLastPlayed: '2026-11-01T10:00:00Z' }),
  game(4, 'Doom', { hidden: true, playtime: 900 }),
  game(5, 'Celeste 2', { origin: 'steam' }),
  game(6, 'Celeste 10', { origin: 'steam' })
]

const ids = (view: Partial<LibraryView>): number[] =>
  applyLibraryView(games, { ...DEFAULT_LIBRARY_VIEW, ...view }).map((g) => g.id)

describe('applyLibraryView', () => {
  it('lists every non-hidden game alphabetically by default', () => {
    expect(ids({})).toEqual([3, 5, 6, 2, 1])
  })

  it('sorts by recent activity (never played last) and by playtime', () => {
    expect(ids({ sort: 'recent' })).toEqual([3, 1, 5, 6, 2])
    expect(ids({ sort: 'playtime' })).toEqual([2, 1, 3, 5, 6])
  })

  it('sorts by achievement percentage, a real 0% before games without achievements', () => {
    const list = [
      game(1, 'Sem conquistas'),
      game(2, 'Zero', { achievementPercent: 0 }),
      game(3, 'Metade B', { achievementPercent: 50 }),
      game(4, 'Metade A', { achievementPercent: 50 }),
      game(5, 'Platina', { achievementPercent: 100 }),
      game(6, 'Outro sem')
    ]
    const view = { ...DEFAULT_LIBRARY_VIEW, sort: 'achievements' as const }
    expect(applyLibraryView(list, view).map((g) => g.id)).toEqual([5, 4, 3, 2, 6, 1])
  })

  it('sorts by origin name, then by title', () => {
    // By name, not by key: the key would put 2 last.
    const list = [
      game(1, 'A', { origin: 'custom', originName: 'Zeta' }),
      game(2, 'C', { origin: 'zzz', originName: 'Alfa' }),
      game(3, 'B', { origin: 'zzz', originName: 'Alfa' })
    ]
    const view = { ...DEFAULT_LIBRARY_VIEW, sort: 'origin' as const }
    expect(applyLibraryView(list, view).map((g) => g.id)).toEqual([3, 2, 1])
  })

  it('sorts by install state: installed, unknown, not installed', () => {
    expect(ids({ sort: 'install' })).toEqual([5, 6, 1, 3, 2])
  })

  it('shows hidden games only through their filter, whatever the sort', () => {
    expect(ids({ sort: 'install' })).not.toContain(4)
    expect(ids({ sort: 'install', hiddenOnly: true })).toEqual([4])
    // A sort is not a filter: "Limpar filtros" has nothing to clear because of it.
    expect(isFiltered({ ...DEFAULT_LIBRARY_VIEW, sort: 'install' })).toBe(false)
  })

  it('combines the sorts with the filters', () => {
    expect(ids({ sort: 'playtime', installedOnly: true })).toEqual([1, 5, 6])
    expect(ids({ sort: 'install', origin: 'steam' })).toEqual([5, 6])
  })

  it('searches ignoring case, accents, signs and word order', () => {
    expect(ids({ query: 'pokemon red' })).toEqual([2])
    expect(ids({ query: 'RED POKÉ' })).toEqual([2])
    expect(ids({ query: 'assassins' })).toEqual([])
    expect(ids({ query: 'assassin s' })).toEqual([3])
    expect(ids({ query: '  ' })).toEqual([3, 5, 6, 2, 1])
  })

  it('filters by origin and by known install state only', () => {
    expect(ids({ origin: 'steam' })).toEqual([5, 6])
    expect(ids({ installedOnly: true })).toEqual([5, 6, 1])
    // Unknown (3) shows only with neither install filter on.
    expect(ids({ notInstalledOnly: true })).toEqual([2])
  })

  it('lists only beaten games on request', () => {
    const list = [
      game(1, 'A', { beated: true }),
      game(2, 'B'),
      game(3, 'C', { beated: true, hidden: true })
    ]
    const view = { ...DEFAULT_LIBRARY_VIEW, beatenOnly: true }
    expect(applyLibraryView(list, view).map((g) => g.id)).toEqual([1])
    expect(applyLibraryView(list, { ...view, hiddenOnly: true }).map((g) => g.id)).toEqual([3])
    expect(isFiltered(view)).toBe(true)
  })

  it('adds the filters up: each one that is on narrows the list (owner decision)', () => {
    expect(ids({ hiddenOnly: true })).toEqual([4])
    expect(ids({ hiddenOnly: true, installedOnly: true })).toEqual([4])
    expect(ids({ hiddenOnly: true, notInstalledOnly: true })).toEqual([])
    expect(ids({ installedOnly: true, notInstalledOnly: true })).toEqual([])
    expect(ids({ hiddenOnly: true, query: 'doom', origin: 'yuzu' })).toEqual([])
  })

  it('does not mutate the input', () => {
    const copy = [...games]
    applyLibraryView(games, { ...DEFAULT_LIBRARY_VIEW, sort: 'playtime' })
    expect(games).toEqual(copy)
  })
})

describe('isFiltered and searchKey', () => {
  it('ignores sorting when telling whether the list is narrowed', () => {
    expect(isFiltered(DEFAULT_LIBRARY_VIEW)).toBe(false)
    expect(isFiltered({ ...DEFAULT_LIBRARY_VIEW, sort: 'recent' })).toBe(false)
    expect(isFiltered({ ...DEFAULT_LIBRARY_VIEW, hiddenOnly: true })).toBe(true)
    expect(isFiltered({ ...DEFAULT_LIBRARY_VIEW, query: 'a' })).toBe(true)
  })

  it('counts the options of the filters dialog, not the search or the sort', () => {
    expect(activeFilterCount(DEFAULT_LIBRARY_VIEW)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_LIBRARY_VIEW, query: 'a', sort: 'install' })).toBe(0)
    expect(
      activeFilterCount({
        ...DEFAULT_LIBRARY_VIEW,
        origin: 'steam',
        hiddenOnly: true,
        beatenOnly: true,
        installedOnly: true,
        notInstalledOnly: true
      })
    ).toBe(5)
  })

  it('folds accents, trademarks and punctuation', () => {
    expect(searchKey('Pokémon™: Édition—Spéciale')).toBe('pokemon edition speciale')
  })
})

describe('homeGames', () => {
  it('lists installed, non-hidden games, most recent session first', () => {
    const list = [
      game(1, 'B', { timeLastPlayed: '2026-10-01T10:00:00Z' }),
      game(2, 'A'),
      game(3, 'C', { timeLastPlayed: '2026-11-01T10:00:00Z' }),
      game(4, 'D', { installed: false, timeLastPlayed: '2026-11-02T10:00:00Z' }),
      game(5, 'E', { installed: null }),
      game(6, 'F', { hidden: true, timeLastPlayed: '2026-11-02T10:00:00Z' })
    ]
    expect(homeGames(list).map((g) => g.id)).toEqual([3, 1, 2])
  })

  it('has no limit', () => {
    const list = Array.from({ length: 40 }, (_, i) => game(i + 1, 'G' + String(i)))
    expect(homeGames(list)).toHaveLength(40)
  })
})

describe('titleInitial', () => {
  it('is the first letter without accents, or # for a number or a symbol', () => {
    expect(titleInitial('Celeste')).toBe('C')
    expect(titleInitial('  ōkami')).toBe('O')
    expect(titleInitial('Ácaro')).toBe('A')
    expect(titleInitial('7 Days to Die')).toBe('#')
    expect(titleInitial('[REDACTED]')).toBe('#')
    expect(titleInitial('')).toBe('#')
  })
})

describe('playtimeBand and achievementBand', () => {
  it('bands playtime hour by hour under 10h, then in 10-hour steps up to >100h', () => {
    expect(playtimeBand(0)).toBe('0h')
    expect(playtimeBand(1)).toBe('>0h')
    expect(playtimeBand(59)).toBe('>0h')
    expect(playtimeBand(60)).toBe('>1h')
    expect(playtimeBand(5 * 60 + 30)).toBe('>5h')
    expect(playtimeBand(9 * 60 + 59)).toBe('>9h')
    expect(playtimeBand(10 * 60)).toBe('>10h')
    expect(playtimeBand(99 * 60)).toBe('>90h')
    expect(playtimeBand(100 * 60)).toBe('>100h')
    expect(playtimeBand(2000 * 60)).toBe('>100h')
  })

  it('bands achievements in steps of 10%, then >5%, >1%, >0% and 0%', () => {
    expect(achievementBand(100)).toBe('100%')
    expect(achievementBand(99.9)).toBe('>90%')
    expect(achievementBand(80)).toBe('>80%')
    expect(achievementBand(10)).toBe('>10%')
    expect(achievementBand(9.9)).toBe('>5%')
    expect(achievementBand(5)).toBe('>5%')
    expect(achievementBand(4.9)).toBe('>1%')
    expect(achievementBand(1)).toBe('>1%')
    expect(achievementBand(0.5)).toBe('>0%')
    expect(achievementBand(0)).toBe('0%')
    expect(achievementBand(null)).toBeNull()
  })
})
