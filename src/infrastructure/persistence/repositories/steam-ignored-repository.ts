import type { SteamIgnoredRepository } from '../../../core/application'
import type { SqliteDatabase } from '../database'

interface IgnoredRow {
  steam_id: number
  title: string
  permanent: number
  ignored_at: string
}

/** Steam games kept out of the library by the user (D-26, DATA_BASE_CONTEXT.md §3.13). */
export function createSteamIgnoredRepository(db: SqliteDatabase): SteamIgnoredRepository {
  const selectExceptions = db.prepare<[], IgnoredRow>(
    'SELECT * FROM steam_ignored WHERE permanent = 1 ORDER BY title COLLATE NOCASE, steam_id'
  )
  const selectIds = db.prepare<[], { steam_id: number }>('SELECT steam_id FROM steam_ignored')
  // An exception wins over a plain removal; the first date stays.
  const insert = db.prepare<[number, string, number, string]>(
    `INSERT INTO steam_ignored (steam_id, title, permanent, ignored_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (steam_id) DO UPDATE SET permanent = max(permanent, excluded.permanent)`
  )
  const release = db.prepare<[number]>(
    'UPDATE steam_ignored SET permanent = 0 WHERE steam_id = ? AND permanent = 1'
  )
  const clearRemoved = db.prepare('DELETE FROM steam_ignored WHERE permanent = 0')

  return {
    list: () =>
      selectExceptions.all().map((row) => ({
        steamAppId: row.steam_id,
        title: row.title,
        ignoredAt: row.ignored_at
      })),
    appIds: () => new Set(selectIds.all().map((row) => row.steam_id)),
    add: (game, options) => {
      insert.run(game.steamAppId, game.title, options.permanent ? 1 : 0, game.ignoredAt)
    },
    release: (steamAppId) => release.run(steamAppId).changes > 0,
    clearRemoved: () => clearRemoved.run().changes
  }
}
