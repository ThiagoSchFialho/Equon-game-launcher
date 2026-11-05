import { NotFoundError, type GameRepository } from '../../../core/application'
import { COUNTED_SESSION_STATUSES, playtimeMinutes, type Game } from '../../../core/domain'
import type { SqliteDatabase } from '../database'
import { toBit, toBool, toNullableBit, toNullableBool } from './rows'

interface GameRow {
  id: number
  origin: string
  steam_id: number | null
  title: string
  description: string | null
  developer: string | null
  release_date: string | null
  time_last_played: string | null
  hidden: number
  installed: number | null
  playtime: number
  beated: number
  required_age: string | null
  metadata_fetched_at: string | null
  steam_playtime_baseline: number | null
  steam_synced_at: string | null
  playtime_offset: number
  achievements_synced_at: string | null
  artwork_checked_at: string | null
}

const toGame = (row: GameRow): Game => ({
  id: row.id,
  origin: row.origin,
  steamAppId: row.steam_id,
  title: row.title,
  description: row.description,
  developer: row.developer,
  releaseDate: row.release_date,
  timeLastPlayed: row.time_last_played,
  hidden: toBool(row.hidden),
  installed: toNullableBool(row.installed),
  playtime: row.playtime,
  playtimeOffset: row.playtime_offset,
  beated: toBool(row.beated),
  requiredAge: row.required_age,
  metadataFetchedAt: row.metadata_fetched_at,
  artworkCheckedAt: row.artwork_checked_at,
  achievementsSyncedAt: row.achievements_synced_at
})

const countedStatuses = COUNTED_SESSION_STATUSES.map((s) => `'${s}'`).join(', ')

export function createGameRepository(db: SqliteDatabase): GameRepository {
  const insert = db.prepare<Record<string, unknown>, GameRow>(`
    INSERT INTO games
      (origin, steam_id, title, description, developer, release_date, required_age, installed, playtime_offset)
    VALUES
      (@origin, @steamAppId, @title, @description, @developer, @releaseDate, @requiredAge, @installed, @playtimeOffset)
    RETURNING *`)
  const selectById = db.prepare<[number], GameRow>('SELECT * FROM games WHERE id = ?')
  const selectAll = db.prepare<[], GameRow>('SELECT * FROM games ORDER BY title COLLATE NOCASE, id')

  // Sync-owned columns only. NULLIF/COALESCE: an empty or missing value never
  // replaces a stored one. hidden, beated, playtime, time_last_played,
  // installed and the Steam playtime baseline are deliberately absent.
  const upsertSteam = db.prepare<Record<string, unknown>, GameRow>(`
    INSERT INTO games (origin, steam_id, title, description, developer, release_date, required_age, metadata_fetched_at)
    VALUES ('steam', @steamAppId, @title, NULLIF(@description, ''), NULLIF(@developer, ''),
            NULLIF(@releaseDate, ''), NULLIF(@requiredAge, ''), @metadataFetchedAt)
    ON CONFLICT (steam_id) DO UPDATE SET
      title               = COALESCE(NULLIF(trim(excluded.title), ''), games.title),
      description         = COALESCE(excluded.description, games.description),
      developer           = COALESCE(excluded.developer, games.developer),
      release_date        = COALESCE(excluded.release_date, games.release_date),
      required_age        = COALESCE(excluded.required_age, games.required_age),
      metadata_fetched_at = COALESCE(excluded.metadata_fetched_at, games.metadata_fetched_at)
    RETURNING *`)

  const selectBySteamAppId = db.prepare<[number], GameRow>('SELECT * FROM games WHERE steam_id = ?')

  const updateArtworkChecked = db.prepare<[string, number]>(
    'UPDATE games SET artwork_checked_at = ? WHERE id = ?'
  )

  const updateAchievementsSynced = db.prepare<[string, number]>(
    'UPDATE games SET achievements_synced_at = ? WHERE id = ?'
  )

  const updateFlags = db.prepare<Record<string, unknown>, GameRow>(`
    UPDATE games SET hidden = COALESCE(@hidden, hidden), beated = COALESCE(@beated, beated)
    WHERE id = @id RETURNING *`)
  // User-editable fields only; flags, playtime and Steam data are left alone.
  const updateManual = db.prepare<Record<string, unknown>, GameRow>(`
    UPDATE games SET
      origin = @origin, title = @title, description = @description, developer = @developer,
      release_date = @releaseDate, required_age = @requiredAge, playtime_offset = @playtimeOffset
    WHERE id = @id AND origin <> 'steam'
    RETURNING *`)
  const updateInstalled = db.prepare<[number | null, number]>(
    'UPDATE games SET installed = ? WHERE id = ?'
  )
  const remove = db.prepare<[number]>('DELETE FROM games WHERE id = ?')

  // Sessions not yet included in the Steam baseline: all of them when the game
  // was never synced, otherwise those started since the sync.
  const countedSessions = db.prepare<
    { id: number; since: string | null },
    { duration_seconds: number; ended_at: string }
  >(`
    SELECT duration_seconds, ended_at FROM play_sessions
    WHERE game_id = @id AND status IN (${countedStatuses})
      AND (@since IS NULL OR started_at >= @since)`)
  // time_last_played only moves forward here.
  const updatePlayStats = db.prepare<Record<string, unknown>, GameRow>(`
    UPDATE games SET
      playtime = @playtime,
      time_last_played = CASE
        WHEN @lastPlayed IS NOT NULL AND (time_last_played IS NULL OR @lastPlayed > time_last_played)
        THEN @lastPlayed ELSE time_last_played END
    WHERE id = @id RETURNING *`)
  // Steam is the source of truth at sync time: overwrite last played when it reports one.
  const applySteamSync = db.prepare<Record<string, unknown>, { id: number }>(`
    UPDATE games SET
      steam_playtime_baseline = @minutes,
      steam_synced_at = @syncedAt,
      time_last_played = COALESCE(@lastPlayed, time_last_played)
    WHERE steam_id = @steamAppId AND origin = 'steam'
      AND (@onlyUnsynced = 0 OR steam_synced_at IS NULL)
    RETURNING id`)

  const found = (row: GameRow | undefined, id: number): Game => {
    if (!row) throw new NotFoundError('Game', id)
    return toGame(row)
  }

  return {
    create: (game) =>
      toGame(
        insert.get({
          origin: game.origin,
          steamAppId: game.steamAppId ?? null,
          title: game.title,
          description: game.description ?? null,
          developer: game.developer ?? null,
          releaseDate: game.releaseDate ?? null,
          requiredAge: game.requiredAge ?? null,
          installed: toNullableBit(game.installed),
          playtimeOffset: game.playtimeOffset ?? 0
        }) as GameRow
      ),

    findBySteamAppId: (appId) => {
      const row = selectBySteamAppId.get(appId)
      return row ? toGame(row) : null
    },

    getById: (id) => {
      const row = selectById.get(id)
      return row ? toGame(row) : null
    },

    list: () => selectAll.all().map(toGame),

    upsertSteamGame: (game) =>
      toGame(
        upsertSteam.get({
          steamAppId: game.steamAppId,
          title: game.title,
          description: game.description ?? null,
          developer: game.developer ?? null,
          releaseDate: game.releaseDate ?? null,
          requiredAge: game.requiredAge ?? null,
          metadataFetchedAt: game.metadataFetchedAt ?? null
        }) as GameRow
      ),

    setFlags: (id, flags) =>
      found(
        updateFlags.get({
          id,
          hidden: flags.hidden === undefined ? null : toBit(flags.hidden),
          beated: flags.beated === undefined ? null : toBit(flags.beated)
        }),
        id
      ),

    updateManual: (id, fields) =>
      db.transaction(() => {
        found(updateManual.get({ id, ...fields }), id)
        // The offset may have changed: playtime is derived from it.
        return recomputePlayStats(id)
      })(),

    setInstalled: (id, installed) => {
      updateInstalled.run(toNullableBit(installed), id)
    },

    delete: (id) => remove.run(id).changes > 0,

    recomputePlayStats: (id) => recomputePlayStats(id),

    setArtworkChecked: (id, checkedAt) => {
      updateArtworkChecked.run(checkedAt, id)
    },

    setAchievementsSynced: (id, syncedAt) => {
      updateAchievementsSynced.run(syncedAt, id)
    },

    applySteamPlayStats: (stats, syncedAt, options) =>
      db.transaction(() => {
        let updated = 0
        for (const s of stats) {
          const row = applySteamSync.get({
            steamAppId: s.steamAppId,
            minutes: s.playtimeMinutes,
            syncedAt,
            lastPlayed: s.lastPlayed,
            onlyUnsynced: options?.onlyUnsynced ? 1 : 0
          })
          if (!row) continue
          recomputePlayStats(row.id)
          updated++
        }
        return updated
      })()
  }

  function recomputePlayStats(id: number): Game {
    return db.transaction(() => {
      const game = selectById.get(id)
      if (!game) throw new NotFoundError('Game', id)
      const sessions = countedSessions.all({ id, since: game.steam_synced_at })
      const lastPlayed = sessions.reduce<string | null>(
        (max, s) => (max === null || s.ended_at > max ? s.ended_at : max),
        null
      )
      const playtime = playtimeMinutes(
        sessions.map((s) => s.duration_seconds),
        // Steam games use the synced baseline; others the user-entered offset.
        game.steam_playtime_baseline ?? game.playtime_offset
      )
      return found(updatePlayStats.get({ id, playtime, lastPlayed }), id)
    })()
  }
}
