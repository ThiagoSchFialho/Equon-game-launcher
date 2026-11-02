import { BuiltinOrigin, toUtcIso } from '../domain'
import { LaunchError } from './errors'
import type {
  Clock,
  GameRepository,
  LaunchConfigRepository,
  ProcessLauncher,
  Repeat,
  SessionRepository,
  UnitOfWork
} from './ports'

export interface GameRunnerDeps {
  games: GameRepository
  configs: LaunchConfigRepository
  sessions: SessionRepository
  uow: UnitOfWork
  launcher: ProcessLauncher
  clock: Clock
  repeat: Repeat
  /** Heartbeat interval (DATA_BASE_CONTEXT.md §3.8); about 30 s. */
  heartbeatMs: number
  /** Called when the set of running games changes. */
  onRunningChanged: (runningGameIds: number[]) => void
  /** Called when closing a session fails (the game itself already ended). */
  onError?: (error: unknown) => void
}

export interface GameRunner {
  launch(gameId: number): Promise<void>
  runningGameIds(): number[]
}

/**
 * Starts manual games and tracks their sessions (D-08): a running session
 * is inserted once the process has started, refreshed by a heartbeat while
 * it runs, and completed in the same transaction that recomputes playtime
 * when the process exits. Only the process the launcher started is observed;
 * games that hand off to another launcher end their session early.
 */
export function createGameRunner(deps: GameRunnerDeps): GameRunner {
  const running = new Map<number, number>() // gameId → sessionId
  const starting = new Set<number>() // launch in progress (guards double presses)
  const now = (): string => toUtcIso(deps.clock.now())
  const notify = (): void => deps.onRunningChanged([...running.keys()])

  return {
    runningGameIds: () => [...running.keys()],

    async launch(gameId) {
      const game = deps.games.getById(gameId)
      if (!game || game.origin === BuiltinOrigin.steam) throw new LaunchError('not-found')
      if (running.has(gameId) || starting.has(gameId)) throw new LaunchError('already-running')
      const config = deps.configs.get(gameId)
      if (!config) throw new LaunchError('no-config')
      if (game.installed !== true) throw new LaunchError('not-installed')

      let child
      starting.add(gameId)
      try {
        child = await deps.launcher.launch(config)
      } catch (error) {
        throw new LaunchError(
          'start-failed',
          error instanceof Error ? error.message : String(error)
        )
      } finally {
        starting.delete(gameId)
      }

      const session = deps.sessions.start(gameId, now())
      running.set(gameId, session.id)
      const stopHeartbeat = deps.repeat(deps.heartbeatMs, () =>
        deps.sessions.touch(session.id, now())
      )
      notify()

      void child.exited.then(() => {
        stopHeartbeat()
        try {
          deps.uow.transaction(() => {
            deps.sessions.complete(session.id, now())
            deps.games.recomputePlayStats(gameId)
          })
        } catch (error) {
          // Left running: the next launcher start closes it at its last heartbeat.
          deps.onError?.(error)
        } finally {
          running.delete(gameId)
          notify()
        }
      })
    }
  }
}

/**
 * On startup: sessions still running belong to a launcher that died. Close
 * each at its last heartbeat and add its time (D-08), one transaction.
 * Returns the affected game ids.
 */
export function recoverInterruptedSessions(
  deps: Pick<GameRunnerDeps, 'games' | 'sessions' | 'uow'>
): number[] {
  return deps.uow.transaction(() => {
    const gameIds = new Set<number>()
    for (const session of deps.sessions.listRunning()) {
      deps.sessions.interrupt(session.id)
      gameIds.add(session.gameId)
    }
    for (const id of gameIds) deps.games.recomputePlayStats(id)
    return [...gameIds]
  })
}
