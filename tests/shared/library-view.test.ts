import { describe, expect, it } from 'vitest'
import type { GameSummary } from '../../src/shared/ipc/contract'
import {
  DEFAULT_LIBRARY_VIEW,
  applyLibraryView,
  homeGames,
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

  it('applies the limit', () => {
    const list = Array.from({ length: 20 }, (_, i) => game(i + 1, `G${i + 10}`))
    expect(homeGames(list, 5)).toHaveLength(5)
  })
})
