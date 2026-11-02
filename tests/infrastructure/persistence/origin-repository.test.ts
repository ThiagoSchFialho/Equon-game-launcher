import { beforeEach, describe, expect, it } from 'vitest'
import {
  BuiltinOriginError,
  DuplicateNameError,
  InvalidNameError,
  NotFoundError,
  OriginInUseError,
  type OriginRepository
} from '../../../src/core/application'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence'
import { createOriginRepository } from '../../../src/infrastructure/persistence'
import { createTestDb, insertGame } from '../../helpers/db'

let db: SqliteDatabase
let origins: OriginRepository

beforeEach(() => {
  db = createTestDb()
  origins = createOriginRepository(db)
})

describe('OriginRepository', () => {
  it('lists the built-in origins by name', () => {
    expect(origins.list()).toEqual([
      { key: 'manual', name: 'PC', builtin: true },
      { key: 'ps2', name: 'PlayStation 2', builtin: true },
      { key: 'steam', name: 'Steam', builtin: true },
      { key: 'yuzu', name: 'Yuzu', builtin: true }
    ])
  })

  it('creates a user origin with a key derived from the normalized name', () => {
    expect(origins.create('  Nintendo   64 ')).toEqual({
      key: 'nintendo-64',
      name: 'Nintendo 64',
      builtin: false
    })
  })

  it('makes the key unique when two names map to the same key', () => {
    origins.create('Nintendo 64')
    expect(origins.create('Nintendo-64').key).toBe('nintendo-64-2')
  })

  it('rejects duplicate names regardless of case, and unusable names', () => {
    expect(() => origins.create('playstation 2')).toThrow(DuplicateNameError)
    expect(() => origins.create('  !!! ')).toThrow(InvalidNameError)
  })

  it('renames without changing the key, including built-in origins', () => {
    const n64 = origins.create('N64')
    expect(origins.rename(n64.key, 'Nintendo 64')).toEqual({ ...n64, name: 'Nintendo 64' })
    expect(origins.rename('yuzu', 'Nintendo Switch').key).toBe('yuzu')
    expect(() => origins.rename('yuzu', 'Steam')).toThrow(DuplicateNameError)
    expect(origins.rename('ps2', 'PlayStation 2').name).toBe('PlayStation 2')
    expect(() => origins.rename('missing', 'X')).toThrow(NotFoundError)
  })

  it('deletes unused user origins only', () => {
    const n64 = origins.create('Nintendo 64')
    const gc = origins.create('GameCube')
    insertGame(db, { origin: gc.key })

    expect(() => origins.delete('ps2')).toThrow(BuiltinOriginError)
    expect(() => origins.delete(gc.key)).toThrow(OriginInUseError)
    expect(() => origins.delete('missing')).toThrow(NotFoundError)

    origins.delete(n64.key)
    expect(origins.list().map((o) => o.key)).not.toContain(n64.key)
  })
})
