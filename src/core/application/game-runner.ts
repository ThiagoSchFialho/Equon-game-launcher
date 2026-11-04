import {
  BuiltinOrigin,
  EMULATORS,
  emulatorForOrigin,
  isAllowedShortcutUrl,
  isShortcutName,
  steamRunUrl,
  type SteamLiveState,
  toUtcIso,
  type Game,
  type LaunchConfig
} from '../domain'
import { LaunchError } from './errors'
import type { SteamSessions } from './steam-sessions'
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
  /** Steam games (D-17): opened by URL, observed through the registry (D-12). */
  steam: {
    sessions: SteamSessions
    openRunUrl(url: string): Promise<void>
    liveState(appId: number): SteamLiveState
    /** How long to wait for Steam to report the game running. */
    startTimeoutMs: number
    /** Longer wait when Steam must update the game first. */
    updateTimeoutMs: number
  }
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
 * Starts games and tracks their sessions (D-08). Steam games open through
 * `steam://rungameid/<appid>` and count as started once Steam reports them
 * running (D-17); their sessions belong to SteamSessions. For manual games
 * a running session is inserted once the process has started, refreshed by a heartbeat while
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

  // The session itself is opened by SteamSessions when the registry shows the game.
  const launchSteam = async (game: Game): Promise<void> => {
    const appId = game.steamAppId
    if (appId === null) throw new LaunchError('not-found')
    if (deps.steam.sessions.runningGameId() === game.id || starting.has(game.id)) {
      throw new LaunchError('already-running')
    }
    if (game.installed !== true) throw new LaunchError('not-installed')
    const live = deps.steam.liveState(appId)
    if (live === 'updating' || live === 'paused') throw new LaunchError('steam-busy')
    starting.add(game.id)
    try {
      await deps.steam.openRunUrl(steamRunUrl(appId))
      const timeout =
        live === 'update-required' ? deps.steam.updateTimeoutMs : deps.steam.startTimeoutMs
      const started = await deps.steam.sessions.waitForStart(appId, timeout)
      if (!started) throw new LaunchError('start-timeout')
    } catch (error) {
      if (error instanceof LaunchError) throw error
      throw new LaunchError('start-failed', error instanceof Error ? error.message : String(error))
    } finally {
      starting.delete(game.id)
    }
  }

  return {
    runningGameIds: () => {
      const steamGame = deps.steam.sessions.runningGameId()
      return steamGame === null ? [...running.keys()] : [...running.keys(), steamGame]
    },

    async launch(gameId) {
      const game = deps.games.getById(gameId)
      if (!game) throw new LaunchError('not-found')
      if (game.origin === BuiltinOrigin.steam) return launchSteam(game)
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
