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
  beated: toBool(row.beated),
  requiredAge: row.required_age,
  metadataFetchedAt: row.metadata_fetched_at
})

const countedStatuses = COUNTED_SESSION_STATUSES.map((s) => `'${s}'`).join(', ')

export function createGameRepository(db: SqliteDatabase): GameRepository {
  const insert = db.prepare<Record<string, unknown>, GameRow>(`
    INSERT INTO games (origin, steam_id, title, description, developer, release_date, required_age, installed)
    VALUES (@origin, @steamAppId, @title, @description, @developer, @releaseDate, @requiredAge, @installed)
    RETURNING *`)
  const selectById = db.prepare<[number], GameRow>('SELECT * FROM games WHERE id = ?')
  const selectAll = db.prepare<[], GameRow>('SELECT * FROM games ORDER BY title COLLATE NOCASE, id')

  // Sync-owned columns only. NULLIF/COALESCE: an empty or missing value never
  // replaces a stored one. hidden, beated, playtime, time_last_played and
  // installed are deliberately absent from the update clause.
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

  const updateFlags = db.prepare<Record<string, unknown>, GameRow>(`
    UPDATE games SET hidden = COALESCE(@hidden, hidden), beated = COALESCE(@beated, beated)
    WHERE id = @id RETURNING *`)
  const remove = db.prepare<[number]>('DELETE FROM games WHERE id = ?')

  const countedSessions = db.prepare<[number], { duration_seconds: number; ended_at: string }>(`
    SELECT duration_seconds, ended_at FROM play_sessions
    WHERE game_id = ? AND status IN (${countedStatuses})`)
  const updatePlayStats = db.prepare<Record<string, unknown>, GameRow>(`
    UPDATE games SET playtime = @playtime, time_last_played = COALESCE(@lastPlayed, time_last_played)
    WHERE id = @id RETURNING *`)

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
          installed: toNullableBit(game.installed)
        }) as GameRow
      ),

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

    delete: (id) => remove.run(id).changes > 0,

    recomputePlayStats: (id) =>
      db.transaction(() => {
        const sessions = countedSessions.all(id)
        const lastPlayed = sessions.reduce<string | null>(
          (max, s) => (max === null || s.ended_at > max ? s.ended_at : max),
          null
        )
        return found(
          updatePlayStats.get({
            id,
            playtime: playtimeMinutes(sessions.map((s) => s.duration_seconds)),
            lastPlayed
          }),
          id
        )
      })()
  }
}
