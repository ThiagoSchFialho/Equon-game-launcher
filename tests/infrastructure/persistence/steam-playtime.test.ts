import { beforeEach, describe, expect, it } from 'vitest'
import type { GameRepository } from '../../../src/core/application'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence'
import { createGameRepository } from '../../../src/infrastructure/persistence'
import { createTestDb } from '../../helpers/db'

// DATA_BASE_CONTEXT.md §3.11: Steam playtime synced once per launcher start.

let db: SqliteDatabase
let games: GameRepository

beforeEach(() => {
  db = createTestDb()
  games = createGameRepository(db)
})

function addSession(gameId: number, startedAt: string, endedAt: string, seconds: number): void {
  db.prepare(
    "INSERT INTO play_sessions (game_id, started_at, last_seen_at, ended_at, duration_seconds, status) VALUES (?, ?, ?, ?, ?, 'completed')"
  ).run(gameId, startedAt, endedAt, endedAt, seconds)
}

describe('GameRepository.applySteamPlayStats', () => {
  it('overwrites playtime and last played with the Steam values', () => {
    const { id } = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    addSession(id, '2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z', 3600)
    games.recomputePlayStats(id)

    // Steam knows about 10 h, including time played on another computer.
    const updated = games.applySteamPlayStats(
      [{ steamAppId: 620, playtimeMinutes: 600, lastPlayed: '2026-10-20T22:00:00Z' }],
      '2026-11-02T09:00:00Z'
    )

    expect(updated).toBe(1)
    expect(games.getById(id)).toMatchObject({
      playtime: 600,
      timeLastPlayed: '2026-10-20T22:00:00Z'
    })
  })

  it('adds sessions played after the sync on top of the Steam value', () => {
    const { id } = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    games.applySteamPlayStats(
      [{ steamAppId: 620, playtimeMinutes: 600, lastPlayed: '2026-10-20T22:00:00Z' }],
      '2026-11-02T09:00:00Z'
    )

    addSession(id, '2026-11-02T10:00:00Z', '2026-11-02T10:00:50Z', 50)
    addSession(id, '2026-11-02T12:00:00Z', '2026-11-02T12:01:20Z', 80)

    expect(games.recomputePlayStats(id)).toMatchObject({
      playtime: 602, // 600 + floor(130 s / 60)
      timeLastPlayed: '2026-11-02T12:01:20Z'
    })
  })

  it('does not count sessions twice after the next sync', () => {
    const { id } = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    games.applySteamPlayStats(
      [{ steamAppId: 620, playtimeMinutes: 600, lastPlayed: null }],
      '2026-11-02T09:00:00Z'
    )
    addSession(id, '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z', 3600)
    expect(games.recomputePlayStats(id).playtime).toBe(660)

    // Next launcher start: Steam now includes that hour.
    games.applySteamPlayStats(
      [{ steamAppId: 620, playtimeMinutes: 660, lastPlayed: '2026-11-02T11:00:00Z' }],
      '2026-11-03T09:00:00Z'
    )
    expect(games.getById(id)?.playtime).toBe(660)
    expect(games.recomputePlayStats(id).playtime).toBe(660)
  })

  it('lets Steam lower the value (it always overwrites)', () => {
    const { id } = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    addSession(id, '2026-11-01T10:00:00Z', '2026-11-01T12:00:00Z', 7200)
    games.recomputePlayStats(id)
    games.applySteamPlayStats(
      [{ steamAppId: 620, playtimeMinutes: 30, lastPlayed: null }],
      '2026-11-02T09:00:00Z'
    )
    expect(games.getById(id)?.playtime).toBe(30)
  })

  it('keeps last played when Steam reports none', () => {
    const { id } = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    addSession(id, '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z', 3600)
    games.recomputePlayStats(id)
    games.applySteamPlayStats(
      [{ steamAppId: 620, playtimeMinutes: 60, lastPlayed: null }],
      '2026-11-02T09:00:00Z'
    )
    expect(games.getById(id)?.timeLastPlayed).toBe('2026-11-01T11:00:00Z')
  })

  it('ignores unknown App IDs and games of other origins, and never touches flags', () => {
    const steam = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    games.setFlags(steam.id, { hidden: true, beated: true })
    const manual = games.create({ origin: 'manual', title: 'Manual', steamAppId: 400 })

    const updated = games.applySteamPlayStats(
      [
        { steamAppId: 620, playtimeMinutes: 10, lastPlayed: null },
        { steamAppId: 400, playtimeMinutes: 99, lastPlayed: null },
        { steamAppId: 999999, playtimeMinutes: 5, lastPlayed: null }
      ],
      '2026-11-02T09:00:00Z'
    )

    expect(updated).toBe(1)
    expect(games.getById(steam.id)).toMatchObject({ playtime: 10, hidden: true, beated: true })
    expect(games.getById(manual.id)?.playtime).toBe(0)
  })

  it('changes nothing when any entry is invalid (one transaction)', () => {
    const a = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    games.upsertSteamGame({ steamAppId: 400, title: 'Portal' })

    expect(() =>
      games.applySteamPlayStats(
        [
          { steamAppId: 620, playtimeMinutes: 100, lastPlayed: null },
          { steamAppId: 400, playtimeMinutes: -5, lastPlayed: null }
        ],
        '2026-11-02T09:00:00Z'
      )
    ).toThrow(/CHECK/)
    expect(games.getById(a.id)?.playtime).toBe(0)
    const row = db.prepare('SELECT steam_synced_at FROM games WHERE id = ?').get(a.id)
    expect(row).toEqual({ steam_synced_at: null })
  })

  it('is not undone by a later metadata upsert', () => {
    const { id } = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    games.applySteamPlayStats(
      [{ steamAppId: 620, playtimeMinutes: 600, lastPlayed: '2026-10-20T22:00:00Z' }],
      '2026-11-02T09:00:00Z'
    )
    games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2', description: 'Updated' })
    expect(games.recomputePlayStats(id)).toMatchObject({
      playtime: 600,
      timeLastPlayed: '2026-10-20T22:00:00Z'
    })
  })
})

describe('Steam sync columns', () => {
  it('requires baseline and sync time together', () => {
    const { id } = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    expect(() =>
      db.prepare('UPDATE games SET steam_playtime_baseline = 10 WHERE id = ?').run(id)
    ).toThrow(/CHECK/)
    expect(() =>
      db.prepare("UPDATE games SET steam_synced_at = '2026-11-02T09:00:00Z' WHERE id = ?").run(id)
    ).toThrow(/CHECK/)
  })
})
