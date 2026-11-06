import type { ArtworkRepository } from '../../../src/core/application'
import { beforeEach, describe, expect, it } from 'vitest'
import { NotFoundError } from '../../../src/core/application'
import type {
  GameRepository,
  LaunchConfigRepository,
  SessionRepository
} from '../../../src/core/application'
import {
  createArtworkRepository,
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
  })
})

describe('migration 0003', () => {
  it('keeps existing launch configs and adds rom_path', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 2))
    const id = Number(
      fresh.prepare("INSERT INTO games (title, origin) VALUES ('A', 'manual')").run()
        .lastInsertRowid
    )
    fresh
      .prepare(
        "INSERT INTO game_launch_configs (game_id, executable_path, arguments) VALUES (?, 'C:/a.exe', ?)"
      )
      .run(id, '["-w"]')
    migrate(fresh, migrations)
    expect(fresh.prepare('SELECT * FROM game_launch_configs').get()).toEqual({
      game_id: id,
      executable_path: 'C:/a.exe',
      rom_path: null,
      arguments: '["-w"]',
      working_directory: null
    })
    expect(fresh.prepare("SELECT name FROM pragma_table_info('origins')").all()).toEqual([
      { name: 'key' },
      { name: 'name' },
      { name: 'builtin' }
    ])
  })

  it('requires exactly one of executable_path and rom_path, and cascades', () => {
    const id = games.create({ origin: 'yuzu', title: 'Zelda' }).id
    const insert = (exe: string | null, rom: string | null): unknown =>
      db
        .prepare(
          'INSERT INTO game_launch_configs (game_id, executable_path, rom_path) VALUES (?, ?, ?)'
        )
        .run(id, exe, rom)
    expect(() => insert(null, null)).toThrow(/CHECK/)
    expect(() => insert('C:/a.exe', 'D:/z.nsp')).toThrow(/CHECK/)
    insert(null, 'D:/z.nsp')
    games.delete(id)
    expect(count(db, 'game_launch_configs')).toBe(0)
  })

  it('only accepts supported emulators', () => {
    db.prepare("INSERT INTO emulators (key, executable_path) VALUES ('yuzu', 'C:/yuzu.exe')").run()
    expect(() =>
      db.prepare("INSERT INTO emulators (key, executable_path) VALUES ('pcsx2', 'C:/p.exe')").run()
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
      romPath: null,
      arguments: [],
      workingDirectory: null
    })
    expect(db.prepare('SELECT arguments FROM game_launch_configs').get()).toEqual({
      arguments: null
    })
    configs.save({
      gameId: id,
      executablePath: 'C:/Emu/emu.exe',
      romPath: null,
      arguments: ['--fs', 'D:/ROMs/a b.iso'],
      workingDirectory: 'C:/Emu'
    })
    configs.save({
      gameId: id,
      executablePath: null,
      romPath: 'D:/z.nsp',
      arguments: [],
      workingDirectory: null
    })
    expect(configs.get(id)).toMatchObject({ executablePath: null, romPath: 'D:/z.nsp' })
    configs.save({
      gameId: id,
      executablePath: 'C:/Emu/emu.exe',
      romPath: null,
      arguments: ['--fs', 'D:/ROMs/a b.iso'],
      workingDirectory: 'C:/Emu'
    })
    expect(configs.get(id)).toEqual({
      gameId: id,
      executablePath: 'C:/Emu/emu.exe',
      romPath: null,
      arguments: ['--fs', 'D:/ROMs/a b.iso'],
      workingDirectory: 'C:/Emu'
    })
  })

  it('is removed with its game', () => {
    const { id } = games.create({ origin: 'manual', title: 'A' })
    configs.save({
      gameId: id,
      executablePath: 'C:/g.exe',
      romPath: null,
      arguments: [],
      workingDirectory: null
    })
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

describe('migration 0011 and removed art', () => {
  const art = (
    kind: 'logo' | 'header',
    userSelected: boolean
  ): Parameters<ArtworkRepository['save']>[0] => ({
    gameId: 1,
    kind,
    localPath: `1/${kind}.png`,
    source: 'steam',
    sourceUrl: null,
    width: 10,
    height: 10,
    userSelected,
    fetchedAt: null
  })

  it('keeps automatic art away until the user chooses again', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations)
    fresh.prepare("INSERT INTO games (id, title, origin) VALUES (1, 'A', 'manual')").run()
    const repository = createArtworkRepository(fresh)

    repository.save(art('logo', false))
    repository.remove(1, 'logo', '2026-11-05T12:00:00Z')
    expect(repository.get(1, 'logo')).toBeNull()
    expect(repository.listRemoved().get(1)).toEqual(['logo'])

    expect(repository.save(art('logo', false))).toBe(false)
    expect(repository.get(1, 'logo')).toBeNull()

    expect(repository.save(art('logo', true))).toBe(true)
    expect(repository.get(1, 'logo')).toMatchObject({ userSelected: true })
    expect(repository.listRemoved().get(1)).toBeUndefined()

    repository.remove(1, 'logo', '2026-11-05T12:00:00Z')
    fresh.prepare('DELETE FROM games WHERE id = 1').run()
    expect(fresh.prepare('SELECT COUNT(*) AS n FROM game_artwork_removed').get()).toEqual({ n: 0 })
    expect(() =>
      fresh
        .prepare(
          "INSERT INTO game_artwork_removed (game_id, kind, removed_at) VALUES (1, 'other', 'x')"
        )
        .run()
    ).toThrow()
  })
})

describe('migration 0010', () => {
  it('accepts IGDB art and keeps what was stored', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 9))
    fresh.prepare("INSERT INTO games (id, title, origin) VALUES (1, 'A', 'manual')").run()
    const insert = (kind: string, source: string): unknown =>
      fresh
        .prepare(
          'INSERT INTO game_artwork (game_id, kind, local_path, source, user_selected) VALUES (1, ?, ?, ?, 1)'
        )
        .run(kind, 'x', source)
    insert('logo', 'user')
    expect(() => insert('header', 'igdb')).toThrow(/CHECK/)
    migrate(fresh, migrations)
    insert('header', 'igdb')
    expect(() => insert('background', 'other')).toThrow(/CHECK/)
    expect(
      fresh
        .prepare('SELECT kind, source, user_selected AS chosen FROM game_artwork ORDER BY id')
        .all()
    ).toEqual([
      { kind: 'logo', source: 'user', chosen: 1 },
      { kind: 'header', source: 'igdb', chosen: 1 }
    ])
    // The foreign key survived the rebuild.
    fresh.prepare('DELETE FROM games WHERE id = 1').run()
    expect(fresh.prepare('SELECT COUNT(*) AS n FROM game_artwork').get()).toEqual({ n: 0 })
  })
})

describe('migration 0009', () => {
  it('adds empty IGDB credentials, keeping the other keys', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 8))
    fresh.prepare('UPDATE users SET steam_api_key_encrypted = ? WHERE id = 1').run(Buffer.from('k'))
    migrate(fresh, migrations)
    expect(
      fresh
        .prepare(
          'SELECT steam_api_key_encrypted IS NOT NULL AS steam, igdb_client_id_encrypted AS id, igdb_client_secret_encrypted AS secret FROM users'
        )
        .get()
    ).toEqual({ steam: 1, id: null, secret: null })
  })
})

describe('migration 0008', () => {
  it('adds artwork_checked_at: every existing game still gets one try', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 7))
    fresh.prepare("INSERT INTO games (title, origin, steam_id) VALUES ('S', 'steam', 620)").run()
    migrate(fresh, migrations)
    expect(fresh.prepare('SELECT artwork_checked_at FROM games').get()).toEqual({
      artwork_checked_at: null
    })
  })
})

describe('migration 0007', () => {
  it('adds icon_locked, empty until the next sync', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 6))
    const game = fresh
      .prepare("INSERT INTO games (title, origin, steam_id) VALUES ('S', 'steam', 620)")
      .run()
    fresh
      .prepare(
        "INSERT INTO achievements (game_id, api_name, display_name, tier) VALUES (?, 'A', 'A', 'bronze')"
      )
      .run(game.lastInsertRowid)
    migrate(fresh, migrations)
    expect(fresh.prepare('SELECT icon_locked FROM achievements').get()).toEqual({
      icon_locked: null
    })
  })
})

describe('migration 0006', () => {
  it('adds achievements_synced_at, empty for existing games', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 5))
    fresh.prepare("INSERT INTO games (title, origin, steam_id) VALUES ('S', 'steam', 620)").run()
    migrate(fresh, migrations)
    expect(fresh.prepare('SELECT achievements_synced_at FROM games').get()).toEqual({
      achievements_synced_at: null
    })
  })
})

describe('migration 0005', () => {
  it('queues Steam games for a new metadata fetch, keeping stored values', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 4))
    fresh
      .prepare(
        "INSERT INTO games (title, origin, steam_id, description, metadata_fetched_at) VALUES ('S', 'steam', 620, 'D', '2026-11-03T00:00:00Z')"
      )
      .run()
    migrate(fresh, migrations)
    expect(fresh.prepare('SELECT description, metadata_fetched_at FROM games').get()).toEqual({
      description: 'D',
      metadata_fetched_at: null
    })
  })
})

describe('migration 0004', () => {
  it('clears Steam ratings taken from required_age and queues a new metadata fetch', () => {
    const fresh = openDatabase(':memory:')
    migrate(fresh, migrations.slice(0, 3))
    fresh
      .prepare(
        "INSERT INTO games (title, origin, steam_id, required_age, metadata_fetched_at) VALUES ('S', 'steam', 620, '17', '2026-11-03T00:00:00Z')"
      )
      .run()
    fresh
      .prepare("INSERT INTO games (title, origin, required_age) VALUES ('M', 'manual', '12')")
      .run()
    migrate(fresh, migrations)
    expect(
      fresh.prepare('SELECT origin, required_age, metadata_fetched_at FROM games ORDER BY id').all()
    ).toEqual([
      { origin: 'steam', required_age: null, metadata_fetched_at: null },
      { origin: 'manual', required_age: '12', metadata_fetched_at: null }
    ])
  })
})
