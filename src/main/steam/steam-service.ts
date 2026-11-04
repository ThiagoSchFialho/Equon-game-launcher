import {
  refreshSteamLibrary,
  type GameRepository,
  type SteamSessions,
  type UnitOfWork
} from '../../core/application'
import { toUtcIso } from '../../core/domain'
import type { SteamAdapter } from '../../integrations/steam/steam-adapter'
import type { LibraryRefreshInfo } from '../../shared/ipc/contract'

/** How often the registry RunningAppID is read (D-12). */
export const RUNNING_POLL_MS = 2000

export interface SteamServiceDeps {
  games: GameRepository
  uow: UnitOfWork
  adapter: SteamAdapter
  sessions: SteamSessions
  /** Reads HKCU\Software\Valve\Steam\RunningAppID; null when unavailable. */
  readRunningAppId(): Promise<string | null>
  clock: { now(): Date }
  onLibraryChanged(): void
  /** After each scan that read something; `first` is the startup scan. */
  afterScan?(first: boolean): void
  onError?(error: unknown): void
}

export interface SteamService {
  /** Startup: one local scan, then the running-game watcher. */
  start(): void
  stop(): void
  /** Concurrent calls share the scan in progress. */
  refresh(): Promise<LibraryRefreshInfo>
  refreshing(): boolean
  lastRefresh(): LibraryRefreshInfo | null
  /** Re-reads one Steam game before its page is shown; a read failure changes nothing. */
  refreshGame(gameId: number): Promise<void>
}

export function createSteamService(deps: SteamServiceDeps): SteamService {
  let pending: Promise<LibraryRefreshInfo> | null = null
  let last: LibraryRefreshInfo | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let polling = false
  let scanned = false

  const refresh = (): Promise<LibraryRefreshInfo> => {
    pending ??= refreshSteamLibrary(deps, deps.adapter)
      .then((summary) => {
        last = {
          status: summary.status,
          reason: summary.reason,
          added: summary.added,
          missing: summary.missing,
          unknown: summary.unknown,
          duplicates: summary.duplicates.length,
          finishedAt: toUtcIso(deps.clock.now())
        }
        if (summary.status !== 'failed') deps.onLibraryChanged()
        deps.afterScan?.(!scanned)
        scanned = true
        return last
      })
      .finally(() => {
        pending = null
      })
    return pending
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
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    refresh,
    refreshing: () => pending !== null,
    lastRefresh: () => last,

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
