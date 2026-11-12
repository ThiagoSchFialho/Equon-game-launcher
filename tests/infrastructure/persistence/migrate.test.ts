import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../../src/infrastructure/persistence/database'
import { migrate, schemaVersion } from '../../../src/infrastructure/persistence/migrate'
import { migrations, type Migration } from '../../../src/infrastructure/persistence/migrations'

describe('openDatabase', () => {
  it('enables foreign keys on the connection', () => {
    const db = openDatabase(':memory:')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })
})

describe('migrate', () => {
  it('applies every migration and records the version', () => {
    const db = openDatabase(':memory:')
    expect(migrate(db, migrations)).toEqual({ from: 0, to: migrations.length })
    expect(schemaVersion(db)).toBe(migrations.length)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('0015 asks the store again only for Steam games without an age rating', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations.slice(0, 14))
    const add = (origin: string, steamId: number | null, age: string | null): number =>
      db
        .prepare<[string, number | null, string | null], { id: number }>(
          `INSERT INTO games (origin, title, steam_id, required_age, metadata_fetched_at)
           VALUES (?, 'G', ?, ?, '2026-11-04T23:00:00Z') RETURNING id`
        )
        .get(origin, steamId, age)!.id
    const unrated = add('steam', 244210, null)
    const rated = add('steam', 620, '10')
    const manual = add('manual', null, null)

    migrate(db, migrations)

    const fetchedAt = (id: number): unknown =>
      db.prepare('SELECT metadata_fetched_at AS at FROM games WHERE id = ?').get(id)
    expect(fetchedAt(unrated)).toEqual({ at: null })
    expect(fetchedAt(rated)).toEqual({ at: '2026-11-04T23:00:00Z' })
    expect(fetchedAt(manual)).toEqual({ at: '2026-11-04T23:00:00Z' })
  })

  it('0013 keeps existing art and removal marks, and accepts the launch image', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations.slice(0, 12))
    const gameId = db
      .prepare<[], { id: number }>(
        "INSERT INTO games (origin, title) VALUES ('manual', 'A') RETURNING id"
      )
      .get()!.id
    db.prepare(
      "INSERT INTO game_artwork (game_id, kind, local_path, source, user_selected) VALUES (?, 'logo', 'a/logo.png', 'user', 1)"
    ).run(gameId)
    db.prepare(
      "INSERT INTO game_artwork_removed (game_id, kind, removed_at) VALUES (?, 'header', '2026-11-07T10:00:00Z')"
    ).run(gameId)

    migrate(db, migrations)

    expect(db.prepare('SELECT kind, user_selected FROM game_artwork').all()).toEqual([
      { kind: 'logo', user_selected: 1 }
    ])
    expect(db.prepare('SELECT kind FROM game_artwork_removed').all()).toEqual([{ kind: 'header' }])
    const insert = (kind: string): void => {
      db.prepare(
        "INSERT INTO game_artwork (game_id, kind, local_path, source) VALUES (?, ?, 'a/x.png', 'user')"
      ).run(gameId, kind)
    }
    insert('launch')
    expect(() => insert('poster')).toThrow(/CHECK/)
    // Deleting the game still takes its art along.
    db.prepare('DELETE FROM games WHERE id = ?').run(gameId)
    expect(db.prepare('SELECT count(*) AS n FROM game_artwork').get()).toEqual({ n: 0 })
  })

  it('0020 keeps every user setting and key, and accepts the "Em cima" position', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations.slice(0, 19))
    const key = Buffer.from([1, 2, 3, 250])
    db.prepare(
      `UPDATE users SET steam_id = '76561190000000000', steam_api_key_encrypted = ?,
         steamgriddb_api_key_encrypted = ?, igdb_client_id_encrypted = ?,
         igdb_client_secret_encrypted = ?, platine = 1, gold = 2, silver = 3, bronze = 4,
         start_fullscreen = 1, ui_sounds = 0, home_art_background = 1, home_art_blur = 6,
         home_art_dim = 80, home_cover_size = 30, home_cover_gap = 5,
         home_cover_position = 'bottom'`
    ).run(key, key, key, key)
    const before = db.prepare('SELECT * FROM users').get()

    // Up to 0020 only: later migrations may add columns of their own.
    migrate(db, migrations.slice(0, 20))

    expect(db.prepare('SELECT * FROM users').get()).toEqual(before)
    db.prepare("UPDATE users SET home_cover_position = 'top'").run()
    expect(db.prepare('SELECT home_cover_position AS p FROM users').get()).toEqual({ p: 'top' })
    // Still one row, still the same rules.
    expect(() => db.prepare("UPDATE users SET home_cover_position = 'left'").run()).toThrow(/CHECK/)
    expect(() => db.prepare('INSERT INTO users (id) VALUES (2)').run()).toThrow(/CHECK/)
    expect(() => db.prepare('UPDATE users SET home_cover_size = 101').run()).toThrow(/CHECK/)
  })

  it('0022 keeps existing art and removal marks, and accepts the Home image', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations.slice(0, 21))
    const gameId = db
      .prepare<[], { id: number }>(
        "INSERT INTO games (origin, title) VALUES ('manual', 'A') RETURNING id"
      )
      .get()!.id
    db.prepare(
      "INSERT INTO game_artwork (game_id, kind, local_path, source, user_selected) VALUES (?, 'launch', 'a/launch.png', 'user', 1)"
    ).run(gameId)
    db.prepare(
      "INSERT INTO game_artwork_removed (game_id, kind, removed_at) VALUES (?, 'logo', '2026-11-11T10:00:00Z')"
    ).run(gameId)

    migrate(db, migrations)

    expect(db.prepare('SELECT kind, local_path, user_selected FROM game_artwork').all()).toEqual([
      { kind: 'launch', local_path: 'a/launch.png', user_selected: 1 }
    ])
    expect(db.prepare('SELECT kind FROM game_artwork_removed').all()).toEqual([{ kind: 'logo' }])
    db.prepare(
      "INSERT INTO game_artwork (game_id, kind, local_path, source) VALUES (?, 'home', 'a/home.png', 'user')"
    ).run(gameId)
    db.prepare(
      "INSERT INTO game_artwork_removed (game_id, kind, removed_at) VALUES (?, 'home', '2026-11-11T10:00:00Z')"
    ).run(gameId)
    expect(() =>
      db
        .prepare(
          "INSERT INTO game_artwork (game_id, kind, local_path, source) VALUES (?, 'poster', 'a/x.png', 'user')"
        )
        .run(gameId)
    ).toThrow(/CHECK/)
    // Deleting the game still takes its art along.
    db.prepare('DELETE FROM games WHERE id = ?').run(gameId)
    expect(db.prepare('SELECT count(*) AS n FROM game_artwork').get()).toEqual({ n: 0 })
    expect(db.prepare('SELECT count(*) AS n FROM game_artwork_removed').get()).toEqual({ n: 0 })
  })

  it('is a no-op when the database is up to date', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations)
    expect(migrate(db, migrations)).toEqual({ from: migrations.length, to: migrations.length })
  })

  it('rolls back a failing migration, keeping the previous version', () => {
    const db = openDatabase(':memory:')
    const broken: Migration = {
      version: migrations.length + 1,
      name: 'broken',
      sql: 'CREATE TABLE half_done (a INTEGER) STRICT; INSERT INTO missing_table VALUES (1);'
    }
    expect(() => migrate(db, [...migrations, broken])).toThrow()
    expect(schemaVersion(db)).toBe(migrations.length)
    const table = db.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'").get()
    expect(table).toBeUndefined()
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('rejects a migration that leaves foreign key violations', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations)
    const orphan: Migration = {
      version: migrations.length + 1,
      name: 'orphan',
      sql: "INSERT INTO games (title, origin) VALUES ('Orphan', 'does-not-exist');"
    }
    expect(() => migrate(db, [...migrations, orphan])).toThrow(/foreign key/)
    expect(schemaVersion(db)).toBe(migrations.length)
  })

  it('refuses a database created by a newer app version', () => {
    const db = openDatabase(':memory:')
    db.pragma(`user_version = ${migrations.length + 5}`)
    expect(() => migrate(db, migrations)).toThrow(/newer/)
  })

  it('rejects non-contiguous migration lists', () => {
    const db = openDatabase(':memory:')
    expect(() => migrate(db, [{ version: 2, name: 'gap', sql: '' }])).toThrow(/expected 1/)
  })
})
