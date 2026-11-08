import type { SecretKind, TrophyCounters, UserRepository } from '../../../core/application'
import type { SqliteDatabase } from '../database'

const COUNTERS = 'platine, gold, silver, bronze'

export function createUserRepository(db: SqliteDatabase): UserRepository {
  const selectCounters = db.prepare<[], TrophyCounters>(
    `SELECT ${COUNTERS} FROM users WHERE id = 1`
  )

  // Counters mirror ACHIEVEMENTS: tiers count unlocked achievements; platine
  // counts games with at least one achievement and all of them unlocked.
  const recompute = db.prepare<[], TrophyCounters>(`
    UPDATE users SET
      gold    = (SELECT count(*) FROM achievements WHERE unlocked = 1 AND tier = 'gold'),
      silver  = (SELECT count(*) FROM achievements WHERE unlocked = 1 AND tier = 'silver'),
      bronze  = (SELECT count(*) FROM achievements WHERE unlocked = 1 AND tier = 'bronze'),
      platine = (SELECT count(*) FROM (
                   SELECT game_id FROM achievements GROUP BY game_id HAVING min(unlocked) = 1))
    WHERE id = 1
    RETURNING ${COUNTERS}`)

  const selectSteamId = db.prepare<[], { steam_id: string | null }>(
    'SELECT steam_id FROM users WHERE id = 1'
  )
  const updateSteamId = db.prepare<[string | null]>('UPDATE users SET steam_id = ? WHERE id = 1')

  const selectStartFullscreen = db.prepare<[], { start_fullscreen: number }>(
    'SELECT start_fullscreen FROM users WHERE id = 1'
  )
  const updateStartFullscreen = db.prepare<[number]>(
    'UPDATE users SET start_fullscreen = ? WHERE id = 1'
  )
  const selectUiSounds = db.prepare<[], { ui_sounds: number }>(
    'SELECT ui_sounds FROM users WHERE id = 1'
  )
  const updateUiSounds = db.prepare<[number]>('UPDATE users SET ui_sounds = ? WHERE id = 1')

  // One fixed statement per secret column; column names never come from input.
  const secrets: Record<
    SecretKind,
    {
      select: ReturnType<typeof db.prepare<[], { value: Buffer | null }>>
      update: ReturnType<typeof db.prepare<[Buffer | null]>>
    }
  > = {
    'steam-api-key': {
      select: db.prepare('SELECT steam_api_key_encrypted AS value FROM users WHERE id = 1'),
      update: db.prepare<[Buffer | null]>(
        'UPDATE users SET steam_api_key_encrypted = ? WHERE id = 1'
      )
    },
    'steamgriddb-api-key': {
      select: db.prepare('SELECT steamgriddb_api_key_encrypted AS value FROM users WHERE id = 1'),
      update: db.prepare<[Buffer | null]>(
        'UPDATE users SET steamgriddb_api_key_encrypted = ? WHERE id = 1'
      )
    },
    'igdb-client-id': {
      select: db.prepare('SELECT igdb_client_id_encrypted AS value FROM users WHERE id = 1'),
      update: db.prepare<[Buffer | null]>(
        'UPDATE users SET igdb_client_id_encrypted = ? WHERE id = 1'
      )
    },
    'igdb-client-secret': {
      select: db.prepare('SELECT igdb_client_secret_encrypted AS value FROM users WHERE id = 1'),
      update: db.prepare<[Buffer | null]>(
        'UPDATE users SET igdb_client_secret_encrypted = ? WHERE id = 1'
      )
    }
  }

  return {
    getSteamId: () => selectSteamId.get()?.steam_id ?? null,
    setSteamId: (steamId) => {
      updateSteamId.run(steamId)
    },
    getSecret: (kind) => {
      const value = secrets[kind].select.get()?.value ?? null
      return value === null ? null : new Uint8Array(value)
    },
    setSecret: (kind, encrypted) => {
      secrets[kind].update.run(encrypted === null ? null : Buffer.from(encrypted))
    },
    getStartFullscreen: () => selectStartFullscreen.get()?.start_fullscreen === 1,
    setStartFullscreen: (enabled) => {
      updateStartFullscreen.run(enabled ? 1 : 0)
    },
    // No row yet (first start): the column's default.
    getUiSounds: () => (selectUiSounds.get()?.ui_sounds ?? 1) === 1,
    setUiSounds: (enabled) => {
      updateUiSounds.run(enabled ? 1 : 0)
    },
    getTrophyCounters: () => selectCounters.get() as TrophyCounters,
    recomputeTrophyCounters: () => recompute.get() as TrophyCounters
  }
}
