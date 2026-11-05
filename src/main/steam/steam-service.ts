import {
  refreshSteamLibrary,
  rescanSteamLibrary,
  type GameRepository,
  type OwnedSyncOutcome,
  type SteamSessions,
  type UnitOfWork
} from '../../core/application'
import { toUtcIso } from '../../core/domain'
import type { SteamAdapter } from '../../integrations/steam/steam-adapter'
import type { DuplicateInfo, LibraryRefreshInfo } from '../../shared/ipc/contract'

/** How often the registry RunningAppID is read (D-12). */
export const RUNNING_POLL_MS = 2000
/** How often the local check looks for games installed or removed in Steam (owner decision). */
export const RESCAN_MS = 10_000

export interface SteamServiceDeps {
  games: GameRepository
  uow: UnitOfWork
  adapter: SteamAdapter
  sessions: SteamSessions
  /** Reads HKCU\Software\Valve\Steam\RunningAppID; null when unavailable. */
  readRunningAppId(): Promise<string | null>
  clock: { now(): Date }
  onLibraryChanged(): void
  /** Runs after the local scan, inside every refresh; `first` is the startup one. */
  syncOwned(options: { first: boolean; scanComplete: boolean }): Promise<OwnedSyncOutcome>
  /** A refresh started (true) or ended (false), for the activity indicator. */
  onRefreshing?(refreshing: boolean): void
  /** The local check stays out of the way while the user plays. */
  isGameRunning(): boolean
  /**
   * Background work after a refresh or a check that found new games (metadata and
   * artwork). `retryArtwork`: an explicit request, which also tries answered games.
   */
  afterRefresh?(options: { retryArtwork: boolean }): void
  onError?(error: unknown): void
}

export interface SteamService {
  /** Startup: one refresh (local scan and owned games), then the running-game watcher. */
  start(): void
  stop(): void
  /**
   * The local check, every RESCAN_MS and when the window gets focus: notices games
   * installed or removed in Steam. No network; skipped while a game is running.
   */
  rescan(): Promise<void>
  /** Concurrent calls share the refresh in progress. */
  refresh(): Promise<LibraryRefreshInfo>
  refreshing(): boolean
  lastRefresh(): LibraryRefreshInfo | null
  /** Re-reads one Steam game before its page is shown; a read failure changes nothing. */
  refreshGame(gameId: number): Promise<void>
  /** Candidates found by scans in this run, still to review (they are not stored). */
  duplicates(): DuplicateInfo[]
  dismissDuplicate(manualGameId: number): void
}

export function createSteamService(deps: SteamServiceDeps): SteamService {
  let pending: Promise<LibraryRefreshInfo> | null = null
  let last: LibraryRefreshInfo | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let rescanTimer: ReturnType<typeof setInterval> | null = null
  let rescanning: Promise<void> | null = null
  let polling = false
  let scanned = false
  // manual game id → Steam title; a candidate only appears when the Steam game is first found.
  const duplicates = new Map<number, string>()

  /** A failing online step never breaks the local scan. */
  const syncOwned = async (scanComplete: boolean): Promise<OwnedSyncOutcome> => {
    const first = !scanned
    scanned = true
    try {
      return await deps.syncOwned({ first, scanComplete })
    } catch (error) {
      deps.onError?.(error)
      return { added: 0, duplicates: [], error: 'invalid-response' }
    }
  }

  const runRefresh = async (): Promise<LibraryRefreshInfo> => {
    deps.onRefreshing?.(true)
    try {
      return await scanAndSync()
    } finally {
      deps.onRefreshing?.(false)
    }
  }

  const scanAndSync = async (): Promise<LibraryRefreshInfo> => {
    const startup = !scanned
    // A check in progress read the disk earlier: it must not write after this scan.
    await rescanning
    const summary = await refreshSteamLibrary(deps, deps.adapter)
    const owned = await syncOwned(summary.status === 'complete')
    for (const candidate of [...summary.duplicates, ...owned.duplicates]) {
      duplicates.set(candidate.existingGameId, candidate.discovered.title)
    }
    last = {
      status: summary.status,
      reason: summary.reason,
      added: summary.added + owned.added,
      missing: summary.missing,
      unknown: summary.unknown,
      duplicates: duplicates.size,
      ownedError: owned.error,
      finishedAt: toUtcIso(deps.clock.now())
    }
    if (summary.status !== 'failed' || owned.added > 0) deps.onLibraryChanged()
    deps.afterRefresh?.({ retryArtwork: !startup })
    return last
  }

  const refresh = (): Promise<LibraryRefreshInfo> => {
    pending ??= runRefresh().finally(() => {
      pending = null
    })
    return pending
  }

  const rescan = (): Promise<void> => {
    if (!scanned || pending || deps.isGameRunning()) return Promise.resolve()
    rescanning ??= rescanSteamLibrary(deps, deps.adapter)
      .then((summary) => {
        for (const candidate of summary.duplicates) {
          duplicates.set(candidate.existingGameId, candidate.discovered.title)
        }
        if (summary.changed) deps.onLibraryChanged()
        if (summary.added > 0) deps.afterRefresh?.({ retryArtwork: false })
      })
      .catch((error) => deps.onError?.(error))
      .finally(() => {
        rescanning = null
      })
    return rescanning
  }

  const poll = async (): Promise<void> => {
    if (polling) return
    polling = true
    try {
      const value = await deps.readRunningAppId()
      // An unreadable value (Steam never ran) counts as nothing running.
      deps.sessions.observe(value === null ? null : Number(value))
    } catch (error) {
      deps.onError?.(error)
    } finally {
      polling = false
    }
  }

  return {
    start() {
      void refresh().catch((error) => deps.onError?.(error))
      void poll()
      timer ??= setInterval(() => void poll(), RUNNING_POLL_MS)
      rescanTimer ??= setInterval(() => void rescan(), RESCAN_MS)
    },
    stop() {
      if (timer) clearInterval(timer)
      if (rescanTimer) clearInterval(rescanTimer)
      timer = null
      rescanTimer = null
    },
    refresh,
    rescan,
    refreshing: () => pending !== null,
    lastRefresh: () => last,

    duplicates() {
      const list: DuplicateInfo[] = []
      for (const [manualGameId, steamTitle] of duplicates) {
        const game = deps.games.getById(manualGameId)
        // Removed or hidden meanwhile: nothing left to review.
        if (!game || game.hidden) duplicates.delete(manualGameId)
        else list.push({ manualGameId, manualTitle: game.title, steamTitle })
      }
      return list
    },

    dismissDuplicate(manualGameId) {
      duplicates.delete(manualGameId)
    },

    async refreshGame(gameId) {
      const game = deps.games.getById(gameId)
      if (!game || game.steamAppId === null) return
      const state = await deps.adapter.readGame(game.steamAppId)
      // A successful read of the manifest is authoritative for this game (§3.2).
      if (state && game.installed !== state.installed) {
        deps.games.setInstalled(game.id, state.installed)
        deps.onLibraryChanged()
      }
    }
  }
}
