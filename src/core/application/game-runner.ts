import {
  BuiltinOrigin,
  EMULATORS,
  emulatorForOrigin,
  isAllowedShortcutUrl,
  isShortcutName,
  toUtcIso,
  type Game,
  type LaunchConfig
} from '../domain'
import { LaunchError } from './errors'
import type {
  Clock,
  EmulatorRepository,
  FileInspector,
  GameRepository,
  LaunchConfigRepository,
  ProcessCommand,
  ProcessLauncher,
  Repeat,
  SessionRepository,
  ShortcutLauncher,
  UnitOfWork
} from './ports'

export interface GameRunnerDeps {
  games: GameRepository
  configs: LaunchConfigRepository
  sessions: SessionRepository
  emulators: EmulatorRepository
  uow: UnitOfWork
  launcher: ProcessLauncher
  shortcuts: ShortcutLauncher
  inspector: FileInspector
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

/** What starting a game means: a process to observe, or a store URL to open. */
export type LaunchPlan = { kind: 'process'; command: ProcessCommand } | { kind: 'url'; url: string }

/**
 * Resolves how to start a non-Steam game (DATA_BASE_CONTEXT.md §3.7, §3.12):
 * Yuzu games run the configured emulator with the ROM; .url shortcuts open an
 * allowlisted store URL; anything else runs its executable.
 */
export function resolveLaunchPlan(
  game: Game,
  config: LaunchConfig,
  deps: Pick<GameRunnerDeps, 'emulators' | 'shortcuts' | 'inspector'>
): LaunchPlan {
  if (config.romPath !== null) {
    const emulator = emulatorForOrigin(game.origin) ?? EMULATORS.yuzu
    const configured = deps.emulators.get(emulator.key)
    if (!configured || deps.inspector.stateOf(configured.executablePath) !== 'file') {
      throw new LaunchError('emulator-missing')
    }
    return {
      kind: 'process',
      command: {
        executablePath: configured.executablePath,
        arguments: emulator.argumentsFor(config.romPath),
        workingDirectory: null
      }
    }
  }
  const executablePath = config.executablePath as string
  if (isShortcutName(executablePath)) {
    const url = deps.shortcuts.readUrl(executablePath)
    if (url === null || !isAllowedShortcutUrl(url)) throw new LaunchError('shortcut-invalid')
    return { kind: 'url', url }
  }
  return {
    kind: 'process',
    command: {
      executablePath,
      arguments: config.arguments,
      workingDirectory: config.workingDirectory
    }
  }
}

/**
 * Starts manual games and tracks their sessions (D-08): a running session
 * is inserted once the process has started, refreshed by a heartbeat while
 * it runs, and completed in the same transaction that recomputes playtime
 * when the process exits. Only the process the launcher started is observed;
 * games that hand off to another launcher end their session early, and .url
 * shortcuts are opened without any session (no process to observe).
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

      const plan = resolveLaunchPlan(game, config, deps)
      const detail = (error: unknown): string =>
        error instanceof Error ? error.message : String(error)

      if (plan.kind === 'url') {
        try {
          await deps.shortcuts.openUrl(plan.url)
        } catch (error) {
          throw new LaunchError('start-failed', detail(error))
        }
        return
      }

      let child
      starting.add(gameId)
      try {
        child = await deps.launcher.launch(plan.command)
      } catch (error) {
        throw new LaunchError('start-failed', detail(error))
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
