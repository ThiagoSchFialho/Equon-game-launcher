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
    getTrophyCounters: () => selectCounters.get() as TrophyCounters,
    recomputeTrophyCounters: () => recompute.get() as TrophyCounters
  }
}
