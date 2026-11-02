import { beforeEach, describe, expect, it } from 'vitest'
import { NotFoundError, type GameRepository } from '../../../src/core/application'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence'
import { createGameRepository } from '../../../src/infrastructure/persistence'
import { createTestDb } from '../../helpers/db'

let db: SqliteDatabase
let games: GameRepository

beforeEach(() => {
  db = createTestDb()
  games = createGameRepository(db)
})

describe('GameRepository basics', () => {
  it('creates and reads a game with defaults', () => {
    const game = games.create({ origin: 'ps2', title: 'Shadow of the Colossus' })
    expect(game).toEqual({
      id: game.id,
      origin: 'ps2',
      steamAppId: null,
      title: 'Shadow of the Colossus',
      description: null,
      developer: null,
      releaseDate: null,
      timeLastPlayed: null,
      hidden: false,
      installed: null,
      playtime: 0,
      beated: false,
      requiredAge: null,
      metadataFetchedAt: null
    })
    expect(games.getById(game.id)).toEqual(game)
    expect(games.getById(9999)).toBeNull()
  })

  it('stores the tri-state installed value', () => {
    expect(games.create({ origin: 'manual', title: 'A', installed: true }).installed).toBe(true)
    expect(games.create({ origin: 'manual', title: 'B', installed: false }).installed).toBe(false)
    expect(games.create({ origin: 'manual', title: 'C', installed: null }).installed).toBeNull()
  })

  it('lists games by title, case-insensitively', () => {
    games.create({ origin: 'manual', title: 'zelda' })
    games.create({ origin: 'manual', title: 'Celeste' })
    games.create({ origin: 'manual', title: 'braid' })
    expect(games.list().map((g) => g.title)).toEqual(['braid', 'Celeste', 'zelda'])
  })

  it('updates only the given flags', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    expect(games.setFlags(id, { hidden: true })).toMatchObject({ hidden: true, beated: false })
    expect(games.setFlags(id, { beated: true })).toMatchObject({ hidden: true, beated: true })
    expect(games.setFlags(id, { hidden: false })).toMatchObject({ hidden: false, beated: true })
    expect(() => games.setFlags(9999, { hidden: true })).toThrow(NotFoundError)
  })

  it('deletes a game', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    expect(games.delete(id)).toBe(true)
    expect(games.delete(id)).toBe(false)
  })
})

describe('GameRepository.upsertSteamGame', () => {
  it('inserts a steam game', () => {
    const game = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2', developer: 'Valve' })
    expect(game).toMatchObject({
      origin: 'steam',
      steamAppId: 620,
      title: 'Portal 2',
      developer: 'Valve'
    })
  })

  it('never overwrites manual flags, playtime, last played or installed state', () => {
    const { id } = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    games.setFlags(id, { hidden: true, beated: true })
    db.prepare(
      "UPDATE games SET playtime = 42, time_last_played = '2026-11-01T10:00:00Z', installed = 1 WHERE id = ?"
    ).run(id)

    const updated = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2 (updated)' })

    expect(updated).toMatchObject({
      id,
      title: 'Portal 2 (updated)',
      hidden: true,
      beated: true,
      playtime: 42,
      timeLastPlayed: '2026-11-01T10:00:00Z',
      installed: true
    })
  })

  it('never replaces stored values with missing or empty ones', () => {
    games.upsertSteamGame({
      steamAppId: 620,
      title: 'Portal 2',
      description: 'Puzzle game',
      developer: 'Valve',
      releaseDate: '2011-04-18',
      requiredAge: '10',
      metadataFetchedAt: '2026-11-01T10:00:00Z'
    })
    const updated = games.upsertSteamGame({
      steamAppId: 620,
      title: '  ',
      description: '',
      developer: null
    })
    expect(updated).toMatchObject({
      title: 'Portal 2',
      description: 'Puzzle game',
      developer: 'Valve',
      releaseDate: '2011-04-18',
      requiredAge: '10',
      metadataFetchedAt: '2026-11-01T10:00:00Z'
    })
  })
})

describe('GameRepository.recomputePlayStats', () => {
  const addSession = (
    gameId: number,
    status: string,
    startedAt: string,
    endedAt: string | null,
    seconds: number | null
  ): void => {
    db.prepare(
      'INSERT INTO play_sessions (game_id, started_at, last_seen_at, ended_at, duration_seconds, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(gameId, startedAt, endedAt ?? startedAt, endedAt, seconds, status)
  }

  it('sums completed and interrupted sessions, floors the total and ignores running ones', () => {
    const { id } = games.create({ origin: 'yuzu', title: 'Game' })
    addSession(id, 'completed', '2026-11-01T10:00:00Z', '2026-11-01T10:00:50Z', 50)
    addSession(id, 'interrupted', '2026-11-01T11:00:00Z', '2026-11-01T11:01:20Z', 80)
    addSession(id, 'completed', '2026-11-01T12:00:00Z', '2026-11-01T12:00:45Z', 45)
    addSession(id, 'running', '2026-11-02T09:00:00Z', null, null)

    const game = games.recomputePlayStats(id)

    // 50 + 80 + 45 = 175 s → 2 minutes (per-session rounding would give 0 + 1 + 0).
    expect(game.playtime).toBe(2)
    expect(game.timeLastPlayed).toBe('2026-11-01T12:00:45Z')
  })

  it('is idempotent', () => {
    const { id } = games.create({ origin: 'manual', title: 'Game' })
    addSession(id, 'completed', '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z', 3600)
    const first = games.recomputePlayStats(id)
    expect(games.recomputePlayStats(id)).toEqual(first)
    expect(first.playtime).toBe(60)
  })

  it('keeps an existing last-played date when there are no counted sessions', () => {
    const { id } = games.create({ origin: 'manual', title: 'Game' })
    db.prepare("UPDATE games SET time_last_played = '2026-10-01T10:00:00Z' WHERE id = ?").run(id)
    expect(games.recomputePlayStats(id)).toMatchObject({
      playtime: 0,
      timeLastPlayed: '2026-10-01T10:00:00Z'
    })
  })

  it('fails for an unknown game', () => {
    expect(() => games.recomputePlayStats(9999)).toThrow(NotFoundError)
  })
})
