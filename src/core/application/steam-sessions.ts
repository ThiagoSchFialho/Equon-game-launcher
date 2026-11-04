import { BuiltinOrigin, toUtcIso } from '../domain'
import type { Clock, GameRepository, Repeat, SessionRepository, UnitOfWork } from './ports'

/** Runs `fn` once after `ms`; returns a cancel function. */
export type After = (ms: number, fn: () => void) => () => void

export interface SteamSessionsDeps {
  games: GameRepository
  sessions: SessionRepository
  uow: UnitOfWork
  clock: Clock
  repeat: Repeat
  after: After
  heartbeatMs: number
  /** Called when the running Steam game changes. */
  onChange: () => void
  /** A session closed normally: the launcher saw this game stop. */
  onClosed?: (gameId: number) => void
  onError?: (error: unknown) => void
}

export interface SteamSessions {
  /** Feeds the registry RunningAppID (0 or null = nothing running). */
  observe(appId: number | null): void
  runningGameId(): number | null
  /** Resolves true once `appId` is observed running, false after `timeoutMs`. */
  waitForStart(appId: number, timeoutMs: number): Promise<boolean>
}

/**
 * Steam sessions (D-08, D-12): Steam reports the game it is running in the
 * registry value RunningAppID, for games started by the launcher or by Steam
 * itself. A session starts when a library game appears there and ends when
 * the value goes back to 0 or changes, closing in the same transaction that
 * recomputes playtime. Best-effort: if Steam dies the value can stay stale
 * until Steam or the launcher restarts.
 */
export function createSteamSessions(deps: SteamSessionsDeps): SteamSessions {
  let currentAppId = 0
  let current: { gameId: number; sessionId: number; stopHeartbeat: () => void } | null = null
  const waiters = new Map<number, Set<(started: boolean) => void>>()
  const now = (): string => toUtcIso(deps.clock.now())

  const close = (): void => {
    if (!current) return
    const { gameId, sessionId, stopHeartbeat } = current
    current = null
    stopHeartbeat()
    try {
      deps.uow.transaction(() => {
        deps.sessions.complete(sessionId, now())
        deps.games.recomputePlayStats(gameId)
      })
      deps.onClosed?.(gameId)
    } catch (error) {
      // Left running: the next launcher start closes it at its last heartbeat.
      deps.onError?.(error)
    }
  }

  const open = (appId: number): void => {
    const game = deps.games.findBySteamAppId(appId)
    if (!game || game.origin !== BuiltinOrigin.steam) return
    try {
      const session = deps.sessions.start(game.id, now())
      current = {
        gameId: game.id,
        sessionId: session.id,
        stopHeartbeat: deps.repeat(deps.heartbeatMs, () => deps.sessions.touch(session.id, now()))
      }
    } catch (error) {
      deps.onError?.(error)
    }
  }

  return {
    observe(value) {
      const appId = value !== null && Number.isSafeInteger(value) && value > 0 ? value : 0
      if (appId === currentAppId) return
      currentAppId = appId
      close()
      if (appId > 0) open(appId)
      deps.onChange()
      for (const resolve of waiters.get(appId) ?? []) resolve(true)
      waiters.delete(appId)
    },

    runningGameId: () => current?.gameId ?? null,

    waitForStart(appId, timeoutMs) {
      if (currentAppId === appId) return Promise.resolve(true)
      return new Promise((resolve) => {
        const set = waiters.get(appId) ?? new Set()
        waiters.set(appId, set)
        const done = (started: boolean): void => {
          cancel()
          set.delete(done)
          resolve(started)
        }
        const cancel = deps.after(timeoutMs, () => done(false))
        set.add(done)
      })
    }
  }
}
