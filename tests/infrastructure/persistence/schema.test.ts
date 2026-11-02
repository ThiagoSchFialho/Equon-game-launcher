import { beforeEach, describe, expect, it } from 'vitest'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence/database'
import { count, createTestDb, insertGame } from '../../helpers/db'

let db: SqliteDatabase

beforeEach(() => {
  db = createTestDb()
})

const run = (sql: string, ...params: unknown[]): unknown => db.prepare(sql).run(...params)

describe('schema conventions', () => {
  it('uses STRICT tables (wrong types are rejected)', () => {
    expect(() =>
      run("INSERT INTO games (title, origin, playtime) VALUES ('x', 'manual', 'ten')")
    ).toThrow()
  })

  it('enforces foreign keys', () => {
    expect(() => insertGame(db, { origin: 'not-an-origin' })).toThrow(/FOREIGN KEY/)
  })
})

describe('origins', () => {
  it('seeds the built-in origins', () => {
    const rows = db.prepare('SELECT key, name, builtin FROM origins ORDER BY key').all()
    expect(rows).toEqual([
      { key: 'manual', name: 'Jogo Local', builtin: 1 },
      { key: 'ps2', name: 'PlayStation 2', builtin: 1 },
      { key: 'steam', name: 'Steam', builtin: 1 },
      { key: 'yuzu', name: 'Yuzu', builtin: 1 }
    ])
  })

  it('keeps names unique regardless of case and keys lowercase', () => {
    expect(() => run("INSERT INTO origins (key, name) VALUES ('steam-2', 'STEAM')")).toThrow(
      /UNIQUE/
    )
    expect(() => run("INSERT INTO origins (key, name) VALUES ('N64', 'Nintendo 64')")).toThrow(
      /CHECK/
    )
    expect(() => run("INSERT INTO origins (key, name) VALUES ('n64', '  ')")).toThrow(/CHECK/)
  })

  it('cannot delete an origin that still has games', () => {
    run("INSERT INTO origins (key, name) VALUES ('nintendo-64', 'Nintendo 64')")
    insertGame(db, { origin: 'nintendo-64' })
    expect(() => run("DELETE FROM origins WHERE key = 'nintendo-64'")).toThrow(/FOREIGN KEY/)
  })
})

describe('games', () => {
  it('requires a steam_id for steam games and keeps it unique', () => {
    expect(() => insertGame(db, { origin: 'steam' })).toThrow(/CHECK/)
    insertGame(db, { origin: 'steam', steamId: 620 })
    expect(() => insertGame(db, { origin: 'steam', steamId: 620 })).toThrow(/UNIQUE/)
  })

  it('allows many games without a steam_id', () => {
    insertGame(db)
    insertGame(db)
    expect(count(db, 'games')).toBe(2)
  })

  it('defaults flags and playtime, leaves installed unknown', () => {
    const id = insertGame(db)
    expect(
      db.prepare('SELECT hidden, beated, playtime, installed FROM games WHERE id = ?').get(id)
    ).toEqual({
      hidden: 0,
      beated: 0,
      playtime: 0,
      installed: null
    })
  })

  it.each([
    ['playtime', -1],
    ['hidden', 2],
    ['beated', -1],
    ['installed', 2]
  ])('rejects %s = %s', (column, value) => {
    const id = insertGame(db)
    expect(() => run(`UPDATE games SET ${column} = ? WHERE id = ?`, value, id)).toThrow(/CHECK/)
  })
})

describe('users', () => {
  it('has exactly one row, id 1', () => {
    expect(db.prepare('SELECT id FROM users').all()).toEqual([{ id: 1 }])
    expect(() => run('INSERT INTO users (id) VALUES (2)')).toThrow(/CHECK/)
  })

  it('accepts only 17-digit SteamID64 strings', () => {
    run("UPDATE users SET steam_id = '76561197960287930'")
    expect(() => run("UPDATE users SET steam_id = '7656119796028793'")).toThrow(/CHECK/)
    expect(() => run("UPDATE users SET steam_id = '7656119796028793x'")).toThrow(/CHECK/)
  })

  it('rejects negative counters', () => {
    expect(() => run('UPDATE users SET gold = -1')).toThrow(/CHECK/)
  })
})

describe('achievements', () => {
  const insertAchievement = (gameId: number, apiName: string, extra = ''): unknown =>
    run(
      `INSERT INTO achievements (game_id, api_name, display_name, tier${extra ? ', global_percent' : ''})
       VALUES (?, ?, ?, 'bronze'${extra ? `, ${extra}` : ''})`,
      gameId,
      apiName,
      apiName
    )

  it('is unique per (game_id, api_name)', () => {
    const a = insertGame(db)
    const b = insertGame(db)
    insertAchievement(a, 'WIN')
    insertAchievement(b, 'WIN')
    expect(() => insertAchievement(a, 'WIN')).toThrow(/UNIQUE/)
  })

  it('restricts tier and global_percent', () => {
    const id = insertGame(db)
    expect(() =>
      run(
        "INSERT INTO achievements (game_id, api_name, display_name, tier) VALUES (?, 'X', 'X', 'platinum')",
        id
      )
    ).toThrow(/CHECK/)
    expect(() => insertAchievement(id, 'Y', '100.5')).toThrow(/CHECK/)
    insertAchievement(id, 'Z', 'NULL')
  })
})

describe('play_sessions', () => {
  const start = (gameId: number): unknown =>
    run(
      "INSERT INTO play_sessions (game_id, started_at, last_seen_at, status) VALUES (?, '2026-11-02T10:00:00Z', '2026-11-02T10:00:00Z', 'running')",
      gameId
    )

  it('allows at most one running session per game', () => {
    const a = insertGame(db)
    const b = insertGame(db)
    start(a)
    start(b)
    expect(() => start(a)).toThrow(/UNIQUE/)
  })

  it('allows a new running session once the previous one ended', () => {
    const id = insertGame(db)
    start(id)
    run(
      "UPDATE play_sessions SET status = 'completed', ended_at = '2026-11-02T11:00:00Z', duration_seconds = 3600"
    )
    start(id)
    expect(count(db, 'play_sessions')).toBe(2)
  })

  it.each(['completed', 'interrupted'])('requires end and duration for %s sessions', (status) => {
    const id = insertGame(db)
    expect(() =>
      run(
        "INSERT INTO play_sessions (game_id, started_at, last_seen_at, status) VALUES (?, '2026-11-02T10:00:00Z', '2026-11-02T10:00:00Z', ?)",
        id,
        status
      )
    ).toThrow(/CHECK/)
  })

  it('rejects negative durations and unknown statuses', () => {
    const id = insertGame(db)
    start(id)
    expect(() =>
      run("UPDATE play_sessions SET duration_seconds = -1, ended_at = 'x', status = 'completed'")
    ).toThrow(/CHECK/)
    expect(() => run("UPDATE play_sessions SET status = 'paused'")).toThrow(/CHECK/)
  })
})

describe('game_launch_configs', () => {
  it('stores arguments as a JSON array or NULL', () => {
    const id = insertGame(db)
    run(
      "INSERT INTO game_launch_configs (game_id, executable_path, arguments) VALUES (?, 'C:/emu.exe', '[\"rom.iso\"]')",
      id
    )
    expect(() => run('UPDATE game_launch_configs SET arguments = \'"rom.iso"\'')).toThrow(/CHECK/)
    run('UPDATE game_launch_configs SET arguments = NULL')
  })
})

describe('game_artwork', () => {
  it('is unique per (game_id, kind) and restricts kind, source and dimensions', () => {
    const id = insertGame(db)
    const add = (kind: string, source = 'user', width: number | null = 600): unknown =>
      run(
        'INSERT INTO game_artwork (game_id, kind, local_path, source, width) VALUES (?, ?, ?, ?, ?)',
        id,
        kind,
        `${id}/${kind}.png`,
        source,
        width
      )
    add('cover_portrait')
    expect(() => add('cover_portrait')).toThrow(/UNIQUE/)
    expect(() => add('banner')).toThrow(/CHECK/)
    expect(() => add('logo', 'google')).toThrow(/CHECK/)
    expect(() => add('logo', 'user', 0)).toThrow(/CHECK/)
  })
})

describe('cascading deletes', () => {
  it('removes every child row when a game is deleted, but keeps genres', () => {
    const id = insertGame(db)
    const other = insertGame(db)
    run(
      "INSERT INTO achievements (game_id, api_name, display_name, tier) VALUES (?, 'A', 'A', 'gold')",
      id
    )
    run("INSERT INTO genres (name) VALUES ('Action')")
    run('INSERT INTO game_genres (game_id, genre_id) VALUES (?, 1), (?, 1)', id, other)
    run("INSERT INTO game_launch_configs (game_id, executable_path) VALUES (?, 'C:/g.exe')", id)
    run(
      "INSERT INTO play_sessions (game_id, started_at, last_seen_at, status) VALUES (?, '2026-11-02T10:00:00Z', '2026-11-02T10:00:00Z', 'running')",
      id
    )
    run(
      "INSERT INTO game_artwork (game_id, kind, local_path, source) VALUES (?, 'logo', 'l.png', 'user')",
      id
    )

    run('DELETE FROM games WHERE id = ?', id)

    for (const table of ['achievements', 'game_launch_configs', 'play_sessions', 'game_artwork']) {
      expect(count(db, table)).toBe(0)
    }
    expect(count(db, 'game_genres')).toBe(1)
    expect(count(db, 'genres')).toBe(1)
  })

  it('removes links when a genre is deleted', () => {
    const id = insertGame(db)
    run("INSERT INTO genres (name) VALUES ('RPG')")
    run('INSERT INTO game_genres (game_id, genre_id) VALUES (?, 1)', id)
    expect(() => run('INSERT INTO game_genres (game_id, genre_id) VALUES (?, 1)', id)).toThrow(
      /UNIQUE|PRIMARY/
    )
    run('DELETE FROM genres')
    expect(count(db, 'game_genres')).toBe(0)
  })

  it('keeps genre names unique regardless of case', () => {
    run("INSERT INTO genres (name) VALUES ('Action')")
    expect(() => run("INSERT INTO genres (name) VALUES ('action')")).toThrow(/UNIQUE/)
  })
})
