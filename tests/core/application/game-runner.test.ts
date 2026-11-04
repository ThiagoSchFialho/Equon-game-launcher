import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LaunchError,
  createGameRunner,
  createSteamSessions,
  recoverInterruptedSessions,
  type GameRunner,
  type ProcessCommand,
  type RunningProcess,
  type SteamSessions
} from '../../../src/core/application'
import {
  createEmulatorRepository,
  createGameRepository,
  createLaunchConfigRepository,
  createSessionRepository,
  createUnitOfWork,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import type { SteamLiveState } from '../../../src/core/domain'
import { createTestDb } from '../../helpers/db'

let db: SqliteDatabase
let clock: Date
let ticks: (() => void)[]
let exitProcess: () => void
let launched: ProcessCommand[]
let opened: string[]
let shortcutTargets: Map<string, string | null>
let existing: Set<string>
let runningChanges: number[][]
let launchImpl: (command: ProcessCommand) => Promise<RunningProcess>
let runner: GameRunner
let steamSessions: SteamSessions
let steamOpened: string[]
let live: Map<number, SteamLiveState>
let timeouts: (() => void)[]

const steamDeps = (): Parameters<typeof createGameRunner>[0]['steam'] => ({
  sessions: steamSessions,
  openRunUrl: async (url) => {
    steamOpened.push(url)
  },
  liveState: (appId) => live.get(appId) ?? null,
  startTimeoutMs: 90_000,
  updateTimeoutMs: 600_000
})

const games = (): ReturnType<typeof createGameRepository> => createGameRepository(db)
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function addManualGame(installed: boolean | null = true): number {
  const game = games().create({ origin: 'manual', title: 'Game', installed })
  createLaunchConfigRepository(db).save({
    gameId: game.id,
    executablePath: 'C:/Games/game.exe',
    romPath: null,
    arguments: ['-windowed'],
    workingDirectory: null
  })
  return game.id
}

beforeEach(() => {
  db = createTestDb()
  clock = new Date('2026-11-02T10:00:00Z')
  ticks = []
  launched = []
  opened = []
  shortcutTargets = new Map()
  existing = new Set()
  runningChanges = []
  steamOpened = []
  live = new Map()
  timeouts = []
  steamSessions = createSteamSessions({
    games: createGameRepository(db),
    sessions: createSessionRepository(db),
    uow: createUnitOfWork(db),
    clock: { now: () => clock },
    repeat: () => () => {},
    after: (_ms, fn) => {
      timeouts.push(fn)
      return () => (timeouts = timeouts.filter((t) => t !== fn))
    },
    heartbeatMs: 30_000,
    onChange: () => {}
  })
  launchImpl = async (command) => {
    launched.push(command)
    return { pid: 4242, exited: new Promise<void>((r) => (exitProcess = r)) }
  }
  runner = createGameRunner({
    games: games(),
    configs: createLaunchConfigRepository(db),
    sessions: createSessionRepository(db),
    uow: createUnitOfWork(db),
    launcher: { launch: (command) => launchImpl(command) },
    emulators: createEmulatorRepository(db),
    shortcuts: {
      readUrl: (path) => shortcutTargets.get(path) ?? null,
      openUrl: async (url) => {
        opened.push(url)
      }
    },
    inspector: { stateOf: (path) => (existing.has(path) ? 'file' : 'missing') },
    clock: { now: () => clock },
    repeat: (_ms, tick) => {
      ticks.push(tick)
      return () => (ticks = ticks.filter((t) => t !== tick))
    },
    heartbeatMs: 30_000,
    onRunningChanged: (ids) => runningChanges.push(ids),
    steam: steamDeps()
  })
})

describe('game runner', () => {
  it('launches, heartbeats and records the session when the process exits', async () => {
    const id = addManualGame()
    await runner.launch(id)

    expect(launched[0]).toMatchObject({
      executablePath: 'C:/Games/game.exe',
      arguments: ['-windowed']
    })
    expect(runner.runningGameIds()).toEqual([id])
    expect(runningChanges.at(-1)).toEqual([id])

    clock = new Date('2026-11-02T10:00:30Z')
    ticks.forEach((tick) => tick())
    expect(createSessionRepository(db).listRunning()[0].lastSeenAt).toBe('2026-11-02T10:00:30Z')

    clock = new Date('2026-11-02T11:30:20Z')
    exitProcess()
    await flush()

    expect(runner.runningGameIds()).toEqual([])
    expect(runningChanges.at(-1)).toEqual([])
    expect(ticks).toHaveLength(0)
    expect(games().getById(id)).toMatchObject({
      playtime: 90,
      timeLastPlayed: '2026-11-02T11:30:20Z'
    })
  })

  it('accumulates seconds across sessions without double counting', async () => {
    const id = addManualGame()
    for (const [start, end] of [
      ['2026-11-02T10:00:00Z', '2026-11-02T10:00:40Z'],
      ['2026-11-02T12:00:00Z', '2026-11-02T12:00:40Z']
    ]) {
      clock = new Date(start)
      await runner.launch(id)
      clock = new Date(end)
      exitProcess()
      await flush()
    }
    expect(games().getById(id)?.playtime).toBe(1) // 80 s
  })

  it('refuses games that cannot be launched', async () => {
    const steam = games().upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    const noConfig = games().create({ origin: 'manual', title: 'No config' })
    const notInstalled = addManualGame(false)

    await expect(runner.launch(9999)).rejects.toMatchObject({ code: 'not-found' })
    // Steam games launch through Steam now; an unknown install state is refused.
    await expect(runner.launch(steam.id)).rejects.toMatchObject({ code: 'not-installed' })
    await expect(runner.launch(noConfig.id)).rejects.toMatchObject({ code: 'no-config' })
    await expect(runner.launch(notInstalled)).rejects.toMatchObject({ code: 'not-installed' })
    expect(launched).toEqual([])
  })

  it('refuses a second launch while the game runs or is starting', async () => {
    const id = addManualGame()
    const first = runner.launch(id)
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'already-running' })
    await first
    await expect(runner.launch(id)).rejects.toBeInstanceOf(LaunchError)
    expect(launched).toHaveLength(1)
  })

  it('records nothing when the process cannot start', async () => {
    const id = addManualGame()
    launchImpl = async () => {
      throw new Error('ENOENT')
    }
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'start-failed' })
    expect(createSessionRepository(db).listRunning()).toEqual([])
    expect(runner.runningGameIds()).toEqual([])
  })

  it('reports a failure to close the session and frees the game', async () => {
    const onError = vi.fn()
    const sessions = createSessionRepository(db)
    runner = createGameRunner({
      games: games(),
      configs: createLaunchConfigRepository(db),
      sessions: {
        ...sessions,
        complete: () => {
          throw new Error('disk full')
        }
      },
      uow: createUnitOfWork(db),
      launcher: { launch: (command) => launchImpl(command) },
      emulators: createEmulatorRepository(db),
      shortcuts: {
        readUrl: (path) => shortcutTargets.get(path) ?? null,
        openUrl: async (url) => {
          opened.push(url)
        }
      },
      inspector: { stateOf: (path) => (existing.has(path) ? 'file' : 'missing') },
      clock: { now: () => clock },
      repeat: () => () => {},
      heartbeatMs: 30_000,
      onRunningChanged: () => {},
      onError,
      steam: steamDeps()
    })
    const id = addManualGame()
    await runner.launch(id)
    exitProcess()
    await flush()
    expect(onError).toHaveBeenCalledOnce()
    expect(runner.runningGameIds()).toEqual([])
    // The session stays running and is recovered on the next start.
    expect(sessions.listRunning()).toHaveLength(1)
  })
})

describe('recoverInterruptedSessions', () => {
  it('closes running sessions at their last heartbeat and adds the time', () => {
    const id = addManualGame()
    const other = addManualGame()
    const sessions = createSessionRepository(db)
    const a = sessions.start(id, '2026-11-02T10:00:00Z')
    sessions.touch(a.id, '2026-11-02T10:45:00Z')
    sessions.start(other, '2026-11-02T09:00:00Z')

    const affected = recoverInterruptedSessions({
      games: games(),
      sessions,
      uow: createUnitOfWork(db)
    })

    expect(affected.sort()).toEqual([id, other].sort())
    expect(sessions.listRunning()).toEqual([])
    expect(games().getById(id)?.playtime).toBe(45)
    expect(games().getById(other)?.playtime).toBe(0)
  })

  it('does nothing when no session was left running', () => {
    expect(
      recoverInterruptedSessions({
        games: games(),
        sessions: createSessionRepository(db),
        uow: createUnitOfWork(db)
      })
    ).toEqual([])
  })
})

describe('game runner: emulators and shortcuts', () => {
  const addGame = (
    origin: string,
    executablePath: string | null,
    romPath: string | null
  ): number => {
    const game = games().create({ origin, title: 'G', installed: true })
    createLaunchConfigRepository(db).save({
      gameId: game.id,
      executablePath,
      romPath,
      arguments: [],
      workingDirectory: null
    })
    return game.id
  }

  it('starts Yuzu games with the configured emulator and the ROM, and tracks them', async () => {
    const id = addGame('yuzu', null, 'D:/Switch/Zelda.nsp')
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'emulator-missing' })

    createEmulatorRepository(db).set('yuzu', 'C:/Yuzu/yuzu.exe')
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'emulator-missing' })

    existing.add('C:/Yuzu/yuzu.exe')
    await runner.launch(id)
    expect(launched.at(-1)).toEqual({
      executablePath: 'C:/Yuzu/yuzu.exe',
      arguments: ['-f', '-g', 'D:/Switch/Zelda.nsp'],
      workingDirectory: null
    })
    expect(runner.runningGameIds()).toEqual([id])
  })

  it('opens allowlisted .url shortcuts without a session', async () => {
    const id = addGame('manual', 'C:/Games/Epic.url', null)
    shortcutTargets.set('C:/Games/Epic.url', 'com.epicgames.launcher://apps/x?action=launch')
    await runner.launch(id)
    expect(opened).toEqual(['com.epicgames.launcher://apps/x?action=launch'])
    expect(launched).toEqual([])
    expect(runner.runningGameIds()).toEqual([])
    expect(createSessionRepository(db).listRunning()).toEqual([])
  })

  it('refuses shortcuts whose target changed to a forbidden URL', async () => {
    const id = addGame('manual', 'C:/Games/Bad.url', null)
    shortcutTargets.set('C:/Games/Bad.url', 'https://example.com')
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'shortcut-invalid' })
    shortcutTargets.set('C:/Games/Bad.url', null)
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'shortcut-invalid' })
    expect(opened).toEqual([])
  })
})

describe('game runner: Steam games', () => {
  const addSteamGame = (installed: boolean | null = true): number => {
    const game = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' })
    games().setInstalled(game.id, installed)
    return game.id
  }

  it('opens steam://rungameid and resolves once Steam reports the game running', async () => {
    const id = addSteamGame()
    const launching = runner.launch(id)
    await flush()
    expect(steamOpened).toEqual(['steam://rungameid/2379780'])
    expect(runner.runningGameIds()).toEqual([])
    steamSessions.observe(2379780)
    await launching
    expect(runner.runningGameIds()).toEqual([id])
    expect(createSessionRepository(db).listRunning()).toHaveLength(1)
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'already-running' })
  })

  it('fails with start-timeout when Steam never reports the game', async () => {
    const id = addSteamGame()
    const launching = runner.launch(id)
    await flush()
    timeouts.forEach((fire) => fire())
    await expect(launching).rejects.toMatchObject({ code: 'start-timeout' })
    expect(createSessionRepository(db).listRunning()).toEqual([])
  })

  it('refuses games that are not installed, unknown, or being updated', async () => {
    const id = addSteamGame(false)
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'not-installed' })
    games().setInstalled(id, null)
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'not-installed' })
    games().setInstalled(id, true)
    live.set(2379780, 'updating')
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'steam-busy' })
    expect(steamOpened).toEqual([])
  })
})
