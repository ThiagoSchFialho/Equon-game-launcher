import type { Achievement, Game, Genre, InstallState, Origin, OriginKey, Tier } from '../domain'

// Ports implemented by infrastructure. They are synchronous because the
// SQLite driver is (ARCHITECTURE.md §12); revisit if persistence moves to a worker.

/** Runs `fn` in one transaction; nested calls become savepoints. */
export interface UnitOfWork {
  transaction<T>(fn: () => T): T
}

export interface OriginRepository {
  /** Ordered by name. */
  list(): Origin[]
  /** Creates a user origin; the key is derived from the name and never changes. */
  create(name: string): Origin
  rename(key: OriginKey, name: string): Origin
  /** Fails for built-in origins and for origins that still have games. */
  delete(key: OriginKey): void
}

export interface NewGame {
  origin: OriginKey
  title: string
  steamAppId?: number | null
  description?: string | null
  developer?: string | null
  releaseDate?: string | null
  requiredAge?: string | null
  installed?: InstallState
}

/** Data the Steam adapter owns. Missing or empty values never replace stored ones. */
export interface SteamGameUpsert {
  steamAppId: number
  title: string
  description?: string | null
  developer?: string | null
  releaseDate?: string | null
  requiredAge?: string | null
  metadataFetchedAt?: string | null
}

/** One game from a Steam GetOwnedGames response (DATA_BASE_CONTEXT.md §3.11). */
export interface SteamPlayStats {
  steamAppId: number
  /** playtime_forever, minutes. */
  playtimeMinutes: number
  /** rtime_last_played as ISO-8601 UTC; null when Steam reports none. */
  lastPlayed: string | null
}

export interface GameFlags {
  hidden?: boolean
  beated?: boolean
}

export interface GameRepository {
  create(game: NewGame): Game
  getById(id: number): Game | null
  /** Ordered by title. */
  list(): Game[]
  /** Never touches hidden, beated, playtime, time_last_played or installed. */
  upsertSteamGame(game: SteamGameUpsert): Game
  setFlags(id: number, flags: GameFlags): Game
  delete(id: number): boolean
  /**
   * Recomputes playtime from completed and interrupted sessions (D-08), on top
   * of the Steam baseline when the game was synced; time_last_played only moves forward.
   */
  recomputePlayStats(id: number): Game
  /**
   * Applies a Steam playtime sync in one transaction: for each steam game
   * already stored, sets the baseline and sync time, overwrites
   * time_last_played (when Steam reports one) and recomputes playtime.
   * Returns how many games were updated. Unknown App IDs are ignored.
   */
  applySteamPlayStats(stats: readonly SteamPlayStats[], syncedAt: string): number
}

export interface GenreRepository {
  list(): Genre[]
  listForGame(gameId: number): Genre[]
  /** Replaces the game's genres; names are normalized and deduplicated case-insensitively. */
  setGameGenres(gameId: number, names: readonly string[]): Genre[]
}

export interface AchievementUpsert {
  apiName: string
  displayName: string
  description: string | null
  icon: string | null
  unlocked: boolean
  unlockedAt: string | null
  globalPercent: number | null
  /** Computed by the application with tierFromGlobalPercent (D-09). */
  tier: Tier
}

export interface AchievementProgress {
  total: number
  unlocked: number
  /** null when no achievement is known. */
  percent: number | null
  platinum: boolean
}

export interface AchievementRepository {
  /** Upserts by (game_id, api_name). Never deletes rows; identical data changes nothing. */
  upsertForGame(gameId: number, achievements: readonly AchievementUpsert[]): void
  /** unlocked_at descending, unknown dates last, then display name and api name. */
  listUnlocked(gameId: number): Achievement[]
  /** global_percent descending (least rare first), unknown last, then display name and api name. */
  listLocked(gameId: number): Achievement[]
  progress(gameId: number): AchievementProgress
}

export interface TrophyCounters {
  platine: number
  gold: number
  silver: number
  bronze: number
}

export interface UserRepository {
  getTrophyCounters(): TrophyCounters
  /** Recomputes counters from ACHIEVEMENTS; never increments blindly. */
  recomputeTrophyCounters(): TrophyCounters
}
