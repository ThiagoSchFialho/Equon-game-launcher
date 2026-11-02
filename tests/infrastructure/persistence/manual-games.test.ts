import { beforeEach, describe, expect, it } from 'vitest'
import { NotFoundError } from '../../../src/core/application'
import type {
  GameRepository,
  LaunchConfigRepository,
  SessionRepository
} from '../../../src/core/application'
import {
  createGameRepository,
  createLaunchConfigRepository,
  createSessionRepository,
  migrate,
  migrations,
  openDatabase,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import { count, createTestDb } from '../../helpers/db'

let db: SqliteDatabase
let games: GameRepository
let configs: LaunchConfigRepository
let sessions: SessionRepository

beforeEach(() => {
  db = createTestDb()
  games = createGameRepository(db)
  configs = createLaunchConfigRepository(db)
  sessions = createSessionRepository(db)
})

describe('migration 0002', () => {
  it('renames the built-in manual origin to "Jogo Local" but keeps a user rename', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 1))
    fresh.prepare("UPDATE origins SET name = 'Meus jogos' WHERE key = 'manual'").run()
    migrate(fresh, migrations)
    expect(fresh.prepare("SELECT name FROM origins WHERE key = 'manual'").get()).toEqual({
      name: 'Meus jogos'
    })
    expect(db.prepare("SELECT name FROM origins WHERE key = 'manual'").get()).toEqual({
      name: 'Jogo Local'
    })
  })

  it('restricts the new columns', () => {
    const id = games.create({ origin: 'manual', title: 'A' }).id
    expect(() => db.prepare('UPDATE games SET playtime_offset = -1 WHERE id = ?').run(id)).toThrow(
      /CHECK/
    )
    expect(() =>
      db.prepare("UPDATE origins SET default_arguments = '\"x\"' WHERE key = 'ps2'").run()
    ).toThrow(/CHECK/)
  })
})

describe('manual game fields and playtime offset', () => {
  it('creates with an offset and counts it in playtime', () => {
    const game = games.create({ origin: 'manual', title: 'A', playtimeOffset: 90 })
    expect(game).toMatchObject({ playtimeOffset: 90 })
    expect(games.recomputePlayStats(game.id).playtime).toBe(90)
  })

  it('updates the editable fields and recomputes playtime with the new offset', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    games.setFlags(id, { hidden: true, beated: true })
    const updated = games.updateManual(id, {
      origin: 'ps2',
      title: 'B',
      description: 'Desc',
      developer: 'Dev',
      releaseDate: '2004-03-01',
      requiredAge: '12',
      playtimeOffset: 30
    })
    expect(updated).toMatchObject({
      origin: 'ps2',
      title: 'B',
      description: 'Desc',
      developer: 'Dev',
      releaseDate: '2004-03-01',
      requiredAge: '12',
      playtimeOffset: 30,
      playtime: 30,
      hidden: true,
      beated: true
    })
  })

  it('refuses to edit Steam games or unknown games', () => {
    const steam = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    const fields = {
      origin: 'manual',
      title: 'X',
      description: null,
      developer: null,
      releaseDate: null,
      requiredAge: null,
      playtimeOffset: 0
    }
    expect(() => games.updateManual(steam.id, fields)).toThrow(NotFoundError)
    expect(() => games.updateManual(9999, fields)).toThrow(NotFoundError)
  })

  it('writes the tri-state install value', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    games.setInstalled(id, true)
    expect(games.getById(id)?.installed).toBe(true)
    games.setInstalled(id, null)
    expect(games.getById(id)?.installed).toBeNull()
  })
})

describe('LaunchConfigRepository', () => {
  it('saves, replaces and reads a config, storing no arguments as NULL', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    expect(configs.get(id)).toBeNull()
    configs.save({
      gameId: id,
      executablePath: 'C:/G/g.exe',
      arguments: [],
      workingDirectory: null
    })
    expect(db.prepare('SELECT arguments FROM game_launch_configs').get()).toEqual({
      arguments: null
    })
    configs.save({
      gameId: id,
      executablePath: 'C:/Emu/emu.exe',
      arguments: ['--fs', 'D:/ROMs/a b.iso'],
      workingDirectory: 'C:/Emu'
    })
    expect(configs.get(id)).toEqual({
      gameId: id,
      executablePath: 'C:/Emu/emu.exe',
      arguments: ['--fs', 'D:/ROMs/a b.iso'],
      workingDirectory: 'C:/Emu'
    })
  })

  it('is removed with its game', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    configs.save({ gameId: id, executablePath: 'C:/g.exe', arguments: [], workingDirectory: null })
    games.delete(id)
    expect(count(db, 'game_launch_configs')).toBe(0)
  })
})

describe('SessionRepository', () => {
  it('starts, heartbeats and completes a session', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    const session = sessions.start(id, '2026-11-02T10:00:00Z')
    expect(session).toMatchObject({ status: 'running', lastSeenAt: '2026-11-02T10:00:00Z' })
    expect(sessions.listRunning()).toHaveLength(1)

    sessions.touch(session.id, '2026-11-02T10:00:30Z')
    const done = sessions.complete(session.id, '2026-11-02T11:00:05Z')

    expect(done).toMatchObject({
      status: 'completed',
      endedAt: '2026-11-02T11:00:05Z',
      lastSeenAt: '2026-11-02T11:00:05Z',
      durationSeconds: 3605
    })
    expect(sessions.listRunning()).toEqual([])
    expect(games.recomputePlayStats(id)).toMatchObject({
      playtime: 60,
      timeLastPlayed: '2026-11-02T11:00:05Z'
    })
  })

  it('interrupts a session at its last heartbeat', () => {
    const { id } = games.create({ origin: 'manual', title: 'A', playtimeOffset: 10 })
    const session = sessions.start(id, '2026-11-02T10:00:00Z')
    sessions.touch(session.id, '2026-11-02T10:20:00Z')

    expect(sessions.interrupt(session.id)).toMatchObject({
      status: 'interrupted',
      endedAt: '2026-11-02T10:20:00Z',
      durationSeconds: 1200
    })
    expect(games.recomputePlayStats(id).playtime).toBe(30)
  })

  it('allows only one running session per game and rejects closing a closed session', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    const session = sessions.start(id, '2026-11-02T10:00:00Z')
    expect(() => sessions.start(id, '2026-11-02T10:05:00Z')).toThrow(/UNIQUE/)
    sessions.complete(session.id, '2026-11-02T10:10:00Z')
    expect(() => sessions.complete(session.id, '2026-11-02T10:20:00Z')).toThrow(NotFoundError)
    expect(() => sessions.interrupt(session.id)).toThrow(NotFoundError)
  })

  it('ignores heartbeats for sessions that are no longer running', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    const session = sessions.start(id, '2026-11-02T10:00:00Z')
    sessions.complete(session.id, '2026-11-02T10:10:00Z')
    sessions.touch(session.id, '2026-11-02T12:00:00Z')
    expect(
      db.prepare('SELECT last_seen_at FROM play_sessions WHERE id = ?').get(session.id)
    ).toEqual({ last_seen_at: '2026-11-02T10:10:00Z' })
  })
})
