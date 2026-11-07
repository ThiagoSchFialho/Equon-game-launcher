import { describe, expect, it } from 'vitest'
import type { GameSummary } from '../../src/shared/ipc/contract'
import {
  DEFAULT_LIBRARY_VIEW,
  activeFilterCount,
  applyLibraryView,
  homeGames,
  includesHidden,
  isFiltered,
  searchKey,
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

  it('sorts beaten games first, then by title', () => {
    const list = [
      game(1, 'C'),
      game(2, 'B', { beated: true }),
      game(3, 'A'),
      game(4, 'D', { beated: true })
    ]
    const view = { ...DEFAULT_LIBRARY_VIEW, sort: 'beaten' as const }
    expect(applyLibraryView(list, view).map((g) => g.id)).toEqual([2, 4, 3, 1])
  })

  it('brings hidden games in only while sorting by them, first', () => {
    expect(ids({ sort: 'hidden' })).toEqual([4, 3, 5, 6, 2, 1])
    expect(ids({ sort: 'title' })).not.toContain(4)
    expect(ids({ sort: 'beaten' })).not.toContain(4)
    expect(includesHidden({ ...DEFAULT_LIBRARY_VIEW, sort: 'hidden' })).toBe(true)
    expect(includesHidden(DEFAULT_LIBRARY_VIEW)).toBe(false)
    // It is a sort: "Limpar filtros" has nothing to clear because of it.
    expect(isFiltered({ ...DEFAULT_LIBRARY_VIEW, sort: 'hidden' })).toBe(false)
  })

  it('combines the new sorts with the filters', () => {
    expect(ids({ sort: 'hidden', origin: 'manual', install: 'installed' })).toEqual([4])
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
    expect(ids({ install: 'installed' })).toEqual([5, 6, 1])
    expect(ids({ install: 'missing' })).toEqual([2])
  })

  it('lists only beaten games on request', () => {
    const list = [
      game(1, 'A', { beated: true }),
      game(2, 'B'),
      game(3, 'C', { beated: true, hidden: true })
    ]
    const view = { ...DEFAULT_LIBRARY_VIEW, beatenOnly: true }
    expect(applyLibraryView(list, view).map((g) => g.id)).toEqual([1])
    expect(applyLibraryView(list, { ...view, showHidden: true }).map((g) => g.id)).toEqual([1, 3])
    expect(isFiltered(view)).toBe(true)
  })

  it('shows hidden games only on request, combined with the other filters', () => {
    expect(ids({ showHidden: true })).toContain(4)
    expect(ids({ showHidden: true, sort: 'playtime', install: 'installed' })).toEqual([4, 1, 5, 6])
    expect(ids({ showHidden: true, query: 'doom', origin: 'yuzu' })).toEqual([])
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
    expect(isFiltered({ ...DEFAULT_LIBRARY_VIEW, showHidden: true })).toBe(true)
    expect(isFiltered({ ...DEFAULT_LIBRARY_VIEW, query: 'a' })).toBe(true)
  })

  it('counts the options of the filters dialog, not the search or the sort', () => {
    expect(activeFilterCount(DEFAULT_LIBRARY_VIEW)).toBe(0)
    expect(activeFilterCount({ ...DEFAULT_LIBRARY_VIEW, query: 'a', sort: 'hidden' })).toBe(0)
    expect(
      activeFilterCount({
        ...DEFAULT_LIBRARY_VIEW,
        origin: 'steam',
        install: 'missing',
        showHidden: true,
        beatenOnly: true
      })
    ).toBe(4)
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
