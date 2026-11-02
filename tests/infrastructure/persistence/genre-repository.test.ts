import { beforeEach, describe, expect, it } from 'vitest'
import type { GenreRepository } from '../../../src/core/application'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence'
import { createGenreRepository } from '../../../src/infrastructure/persistence'
import { createTestDb, insertGame } from '../../helpers/db'

let db: SqliteDatabase
let genres: GenreRepository

beforeEach(() => {
  db = createTestDb()
  genres = createGenreRepository(db)
})

describe('GenreRepository', () => {
  it('saves and reads a game’s genres, normalized and deduplicated', () => {
    const id = insertGame(db)
    const saved = genres.setGameGenres(id, ['Action', '  action ', 'Massively   Multiplayer', ''])
    expect(saved.map((g) => g.name)).toEqual(['Action', 'Massively Multiplayer'])
    expect(genres.listForGame(id)).toEqual(saved)
  })

  it('shares genres between games and keeps the first spelling', () => {
    const a = insertGame(db)
    const b = insertGame(db)
    genres.setGameGenres(a, ['RPG'])
    genres.setGameGenres(b, ['rpg', 'Indie'])
    expect(genres.list().map((g) => g.name)).toEqual(['Indie', 'RPG'])
    expect(genres.listForGame(b).map((g) => g.name)).toEqual(['Indie', 'RPG'])
  })

  it('replaces the previous genres of a game', () => {
    const id = insertGame(db)
    genres.setGameGenres(id, ['Action', 'RPG'])
    expect(genres.setGameGenres(id, ['Puzzle']).map((g) => g.name)).toEqual(['Puzzle'])
    // Orphan genres may remain (DATA_BASE_CONTEXT.md §6).
    expect(genres.list()).toHaveLength(3)
  })

  it('rolls back when the game does not exist', () => {
    expect(() => genres.setGameGenres(9999, ['Action'])).toThrow(/FOREIGN KEY/)
    expect(genres.list()).toEqual([])
  })
})
