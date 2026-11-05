import type {
  Achievement,
  ArtworkKind,
  EmulatorConfig,
  EmulatorKey,
  Game,
  GameArtwork,
  Genre,
  InstallState,
  LaunchConfig,
  Origin,
  OriginKey,
  PlaySession,
  Tier
} from '../domain'

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

/** Executables the user configured for supported emulators (DATA_BASE_CONTEXT.md §3.12). */
export interface EmulatorRepository {
  list(): EmulatorConfig[]
  get(key: EmulatorKey): EmulatorConfig | null
  set(key: EmulatorKey, executablePath: string): EmulatorConfig
  remove(key: EmulatorKey): boolean
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
  playtimeOffset?: number
}

/** Fields the user edits on a non-Steam game. */
export interface ManualGameFields {
  origin: OriginKey
  title: string
  description: string | null
  developer: string | null
  releaseDate: string | null
  requiredAge: string | null
  playtimeOffset: number
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
  findBySteamAppId(appId: number): Game | null
  /** Ordered by title. */
  list(): Game[]
  /** Never touches hidden, beated, playtime, time_last_played or installed. */
  upsertSteamGame(game: SteamGameUpsert): Game
  setFlags(id: number, flags: GameFlags): Game
  /** Updates the user-editable fields of a non-Steam game (not flags or playtime itself). */
  updateManual(id: number, fields: ManualGameFields): Game
  /** Writes the install state; callers never pass false after a failed read. */
  setInstalled(id: number, installed: InstallState): void
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
   * Returns how many games were updated. Unknown App IDs are ignored. With
   * `onlyUnsynced`, games that already have a Steam baseline are left alone.
   */
  applySteamPlayStats(
    stats: readonly SteamPlayStats[],
    syncedAt: string,
    options?: { onlyUnsynced?: boolean }
  ): number
  setAchievementsSynced(id: number, syncedAt: string): void
  setArtworkChecked(id: number, checkedAt: string): void
}

export interface LaunchConfigRepository {
  get(gameId: number): LaunchConfig | null
  save(config: LaunchConfig): void
}

export interface SessionRepository {
  /** Inserts a running session (last_seen_at = started_at); one running session per game. */
  start(gameId: number, startedAt: string): PlaySession
  /** Heartbeat while the game is observed. */
  touch(sessionId: number, at: string): void
  /** Closes a running session as completed at `endedAt`. */
  complete(sessionId: number, endedAt: string): PlaySession
  listRunning(): PlaySession[]
  /** Closes a running session as interrupted at its last heartbeat. */
  interrupt(sessionId: number): PlaySession
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
  iconLocked?: string | null
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
  getById(id: number): Achievement | null
}

export interface ArtworkRepository {
  get(gameId: number, kind: ArtworkKind): GameArtwork | null
  /** Kinds with cached artwork, per game id. */
  listKinds(): Map<number, ArtworkKind[]>
  /** When each game's art last changed, per game id. */
  listVersions(): Map<number, string>
  /**
   * Inserts or replaces the artwork of (game, kind). An automatic save
   * (userSelected = false) never replaces art the user selected.
   * Returns false when the existing user-selected art was kept.
   */
  save(artwork: GameArtwork): boolean
}

export interface Clock {
  now(): Date
}

/** A resolved process to start: never a command string, never a shell. */
export interface ProcessCommand {
  executablePath: string
  arguments: string[]
  /** null = the executable's folder. */
  workingDirectory: string | null
}

/** A started game process; `exited` resolves when it ends (any exit code). */
export interface RunningProcess {
  pid: number
  exited: Promise<void>
}

export interface ProcessLauncher {
  /** Starts the executable without a shell; rejects if it cannot be started. */
  launch(command: ProcessCommand): Promise<RunningProcess>
}

/** Windows .url shortcuts: read the target, open an allowlisted store URL. */
export interface ShortcutLauncher {
  /** The URL= target, or null when the file cannot be read or has none. */
  readUrl(path: string): string | null
  /** Opens the URL through the OS (main re-checks the allowlist). */
  openUrl(url: string): Promise<void>
}

/** Result of checking a path from a launch configuration (never throws). */
export type FileState = 'file' | 'directory' | 'missing' | 'unreadable'

export interface FileInspector {
  stateOf(path: string): FileState
}

/** Repeating timer (heartbeats); returns a function that stops it. */
export type Repeat = (intervalMs: number, tick: () => void) => () => void

export interface TrophyCounters {
  platine: number
  gold: number
  silver: number
  bronze: number
}

/** Secrets stored in USERS, always encrypted with safeStorage (D-04, D-15). */
export type SecretKind = 'steam-api-key' | 'steamgriddb-api-key'

export interface UserRepository {
  /** SteamID64 (17 digits) or null. */
  getSteamId(): string | null
  setSteamId(steamId: string | null): void
  /** Encrypted bytes as stored; decrypted only in main. */
  getSecret(kind: SecretKind): Uint8Array | null
  setSecret(kind: SecretKind, encrypted: Uint8Array | null): void
  getTrophyCounters(): TrophyCounters
  /** Recomputes counters from ACHIEVEMENTS; never increments blindly. */
  recomputeTrophyCounters(): TrophyCounters
}
