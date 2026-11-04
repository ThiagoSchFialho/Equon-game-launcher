import {
  applyGameAchievements,
  type AchievementRepository,
  type GameRepository,
  type RemoteAchievements,
  type UnitOfWork,
  type UserRepository
} from '../../core/application'
import { BuiltinOrigin, toUtcIso, type Game } from '../../core/domain'
import {
  ArtworkImportFailure,
  prepareArtworkBytes
} from '../../infrastructure/artwork/import-artwork'
import {
  achievementIconPath,
  writeAchievementIcon
} from '../../infrastructure/artwork/achievement-icons'
import type { HttpGet, HttpGetBytes } from '../../integrations/http'
import {
  fetchAchievementSchema,
  fetchGlobalPercentages,
  fetchPlayerAchievements
} from '../../integrations/steam/steam-achievements'
import type { AchievementSyncStatus } from '../../shared/ipc/contract'

/** Pause between games in a full sync, to stay gentle with the Web API. */
export const FULL_SYNC_INTERVAL_MS = 1000
/** Steam needs a moment to record what was unlocked when a game closes. */
export const AFTER_CLOSE_DELAY_MS = 10_000

export interface AchievementSyncDeps {
  games: GameRepository
  achievements: AchievementRepository
  users: UserRepository
  uow: UnitOfWork
  get: HttpGet
  getBytes: HttpGetBytes
  /** Decrypted only in main; never logged or sent to the renderer. */
  credentials(): { steamId: string | null; steamKey: string | null }
  cacheDir: string
  decode(bytes: Buffer): { width: number; height: number } | null
  clock: { now(): Date }
  wait(ms: number): Promise<void>
  onChanged(): void
  onError?(error: unknown): void
}

export interface AchievementSync {
  /** Only that game (DATA_BASE_CONTEXT.md §5); silent without credentials. */
  syncAfterClose(gameId: number): Promise<void>
  /** Explicit user action; concurrent calls share the run in progress. */
  syncAll(): Promise<AchievementSyncStatus>
  status(): AchievementSyncStatus
  /** True when the last attempt for this game failed: its data is stale. */
  isStale(gameId: number): boolean
  /** Downloads the missing icons of one game, when its screen opens. */
  ensureIcons(gameId: number): Promise<void>
}

/**
 * Achievement sync (ARCHITECTURE.md §10). Never periodic and never automatic
 * for the whole library. Each game is isolated: a failure keeps its last good
 * data, marks it stale and does not stop the others.
 */
export function createAchievementSync(deps: AchievementSyncDeps): AchievementSync {
  const stale = new Map<number, string>()
  const iconRuns = new Map<number, Promise<void>>()
  let run: Promise<AchievementSyncStatus> | null = null
  let status: AchievementSyncStatus = {
    running: false,
    done: 0,
    total: 0,
    failures: [],
    lastRun: null
  }

  const syncGame = async (game: Game): Promise<string | null> => {
    const { steamId, steamKey } = deps.credentials()
    if (!steamId || !steamKey) return 'not-configured'
    const appId = game.steamAppId as number
    const schema = await fetchAchievementSchema(deps.get, steamKey, appId)
    if (!schema.ok) return schema.error

    let remote: RemoteAchievements = {
      definitions: schema.data,
      player: new Map(),
      percentages: new Map()
    }
    // A game without achievements has no player stats: Steam answers with an error.
    if (schema.data.length > 0) {
      const player = await fetchPlayerAchievements(deps.get, steamKey, steamId, appId)
      if (!player.ok) return player.error
      const percentages = await fetchGlobalPercentages(deps.get, appId)
      if (!percentages.ok) return percentages.error
      remote = { definitions: schema.data, player: player.data, percentages: percentages.data }
    }
    applyGameAchievements(deps, game, remote, toUtcIso(deps.clock.now()))
    return null
  }

  /** Runs one game, recording the outcome; never throws. */
  const attempt = async (game: Game): Promise<string | null> => {
    let failure: string | null
    try {
      failure = await syncGame(game)
    } catch (error) {
      deps.onError?.(error)
      failure = 'invalid-response'
    }
    if (failure === null) stale.delete(game.id)
    else stale.set(game.id, failure)
    return failure
  }

  const runAll = async (): Promise<AchievementSyncStatus> => {
    const games = deps.games
      .list()
      .filter((g) => g.origin === BuiltinOrigin.steam && g.steamAppId !== null)
    status = { running: true, done: 0, total: games.length, failures: [], lastRun: status.lastRun }
    deps.onChanged()
    const failures: AchievementSyncStatus['failures'] = []
    for (const game of games) {
      const failure = await attempt(game)
      if (failure !== null) failures.push({ title: game.title, reason: failure })
      status = { ...status, done: status.done + 1, failures: [...failures] }
      deps.onChanged()
      await deps.wait(FULL_SYNC_INTERVAL_MS)
    }
    status = { ...status, running: false, lastRun: toUtcIso(deps.clock.now()) }
    deps.onChanged()
    return status
  }

  const downloadIcons = async (gameId: number): Promise<void> => {
    let changed = 0
    const rows = [
      ...deps.achievements.listUnlocked(gameId),
      ...deps.achievements.listLocked(gameId)
    ]
    for (const row of rows) {
      // Only the art of the current state is needed.
      const locked = !row.unlocked
      const url = locked ? row.iconLocked : row.icon
      if (!url || achievementIconPath(deps.cacheDir, gameId, row.id, locked)) continue
      const bytes = await deps.getBytes(url)
      if (bytes === null) continue
      try {
        // "logo" has no required proportion; icons are small squares.
        const prepared = prepareArtworkBytes(Buffer.from(bytes), 'logo', deps.decode)
        writeAchievementIcon(deps.cacheDir, gameId, row.id, locked, prepared)
        // Shown in batches, so a long list fills in without a refresh per icon.
        if (++changed % 8 === 0) deps.onChanged()
      } catch (error) {
        if (!(error instanceof ArtworkImportFailure)) deps.onError?.(error)
      }
    }
    if (changed % 8 !== 0) deps.onChanged()
  }

  return {
    async syncAfterClose(gameId) {
      const { steamId, steamKey } = deps.credentials()
      if (!steamId || !steamKey) return
      await deps.wait(AFTER_CLOSE_DELAY_MS)
      const game = deps.games.getById(gameId)
      if (!game || game.origin !== BuiltinOrigin.steam || game.steamAppId === null) return
      await attempt(game)
      deps.onChanged()
    },

    syncAll() {
      run ??= runAll().finally(() => {
        run = null
      })
      return run
    },

    status: () => status,
    isStale: (gameId) => stale.has(gameId),

    ensureIcons(gameId) {
      const current = iconRuns.get(gameId)
      if (current) return current
      const started = downloadIcons(gameId)
        .catch((error) => deps.onError?.(error))
        .finally(() => iconRuns.delete(gameId))
      iconRuns.set(gameId, started)
      return started
    }
  }
}
