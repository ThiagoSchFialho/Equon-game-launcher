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
  const selectHomeArt = db.prepare<
    [],
    { home_art_background: number; home_art_blur: number; home_art_dim: number }
  >('SELECT home_art_background, home_art_blur, home_art_dim FROM users WHERE id = 1')
  // COALESCE: a value not given keeps the stored one.
  const updateHomeArt = db.prepare<Record<string, number | null>>(`
    UPDATE users SET
      home_art_background = COALESCE(@enabled, home_art_background),
      home_art_blur = COALESCE(@blur, home_art_blur),
      home_art_dim = COALESCE(@dim, home_art_dim)
    WHERE id = 1`)

  const selectHomeCovers = db.prepare<
    [],
    { home_cover_size: number; home_cover_gap: number; home_cover_position: string }
  >('SELECT home_cover_size, home_cover_gap, home_cover_position FROM users WHERE id = 1')
  const updateHomeCovers = db.prepare<Record<string, number | string | null>>(`
    UPDATE users SET
      home_cover_size = COALESCE(@size, home_cover_size),
      home_cover_gap = COALESCE(@gap, home_cover_gap),
      home_cover_position = COALESCE(@position, home_cover_position)
    WHERE id = 1`)

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
    // No row yet (first start): the columns' defaults.
    getHomeArt: () => {
      const row = selectHomeArt.get()
      return {
        enabled: row?.home_art_background === 1,
        blur: row?.home_art_blur ?? 4,
        dim: row?.home_art_dim ?? 60
      }
    },
    setHomeArt: (changes) => {
      updateHomeArt.run({
        enabled: changes.enabled === undefined ? null : changes.enabled ? 1 : 0,
        blur: changes.blur ?? null,
        dim: changes.dim ?? null
      })
    },
    // No row yet (first start): the columns' defaults.
    getHomeCovers: () => {
      const row = selectHomeCovers.get()
      return {
        size: row?.home_cover_size ?? 74,
        gap: row?.home_cover_gap ?? 35,
        position:
          row?.home_cover_position === 'top' || row?.home_cover_position === 'bottom'
            ? row.home_cover_position
            : 'center'
      }
    },
    setHomeCovers: (changes) => {
      updateHomeCovers.run({
        size: changes.size ?? null,
        gap: changes.gap ?? null,
        position: changes.position ?? null
      })
    },
    getTrophyCounters: () => selectCounters.get() as TrophyCounters,
    recomputeTrophyCounters: () => recompute.get() as TrophyCounters
  }
}
