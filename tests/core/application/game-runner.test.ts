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
/** The interval of each tick in `ticks`. */
let intervals: Map<() => void, number>
/** Fires every repeat of this interval once. */
const fire = (ms: number): void => {
  for (const tick of [...ticks]) if (intervals.get(tick) === ms) tick()
}
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

/**
 * D-37: processes alive in the test, and the game-window watchers the runner keeps; the
 * hand-off waits and the polling run through `repeat`.
 */
let alive: Set<number>
let windowWatchers: Set<(pid: number) => void>
/** A game window shows in process `pid`, for every runner still watching. */
const showWindow = (pid: number): void => {
  for (const watcher of [...windowWatchers]) watcher(pid)
}
const handOffDeps = (): Pick<
  Parameters<typeof createGameRunner>[0],
  'processAlive' | 'processPollMs' | 'handOffWaitMs' | 'shortcutWaitMs' | 'watchGameWindows'
> => ({
  processAlive: (pid) => alive.has(pid),
  processPollMs: 2000,
  handOffWaitMs: 60_000,
  shortcutWaitMs: 180_000,
  watchGameWindows: (_launchedAt, onWindow) => {
    windowWatchers.add(onWindow)
    return () => windowWatchers.delete(onWindow)
  }
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
  intervals = new Map()
  launched = []
  opened = []
  shortcutTargets = new Map()
  existing = new Set()
  runningChanges = []
  steamOpened = []
  live = new Map()
  timeouts = []
  alive = new Set()
  windowWatchers = new Set()
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
    repeat: (ms, tick) => {
      ticks.push(tick)
      intervals.set(tick, ms)
      return () => (ticks = ticks.filter((t) => t !== tick))
    },
    heartbeatMs: 30_000,
    ...handOffDeps(),
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
      // Played past the hand-off wait (D-37): the exit closes the session at once.
      fire(60_000)
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
      // Only the hand-off wait is kept, to end it: the game is played past it (D-37).
      repeat: (ms, tick) => {
        if (ms === 60_000) endWait = tick
        return () => {}
      },
      heartbeatMs: 30_000,
      ...handOffDeps(),
      onRunningChanged: () => {},
      onError,
      steam: steamDeps()
    })
    let endWait = (): void => {}
    const id = addManualGame()
    await runner.launch(id)
    endWait()
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

  it('keeps a ROM game on its own process: no wait for a window when the emulator ends', async () => {
    const id = addGame('yuzu', null, 'D:/Switch/Zelda.nsp')
    createEmulatorRepository(db).set('yuzu', 'C:/Yuzu/yuzu.exe')
    existing.add('C:/Yuzu/yuzu.exe')
    await runner.launch(id)
    clock = new Date('2026-11-02T10:00:05Z')
    exitProcess()
    await flush()
    expect(runner.runningGameIds()).toEqual([])
    expect(createSessionRepository(db).listRunning()).toEqual([])
  })

  it('opens allowlisted .url shortcuts without a session until the game window shows', async () => {
    const id = addGame('manual', 'C:/Games/Epic.url', null)
    shortcutTargets.set('C:/Games/Epic.url', 'com.epicgames.launcher://apps/x?action=launch')
    await runner.launch(id)
    expect(opened).toEqual(['com.epicgames.launcher://apps/x?action=launch'])
    expect(launched).toEqual([])
    expect(runner.runningGameIds()).toEqual([])
    expect(createSessionRepository(db).listRunning()).toEqual([])
  })

  it('moves last played to when a .url shortcut was opened, and leaves playtime alone', async () => {
    const id = addGame('manual', 'C:/Games/Epic.url', null)
    shortcutTargets.set('C:/Games/Epic.url', 'com.epicgames.launcher://apps/x?action=launch')
    await runner.launch(id)
    expect(games().getById(id)).toMatchObject({
      timeLastPlayed: '2026-11-02T10:00:00Z',
      playtime: 0
    })
  })

  it('does not move last played when the shortcut could not be opened', async () => {
    const id = addGame('manual', 'C:/Games/Bad.url', null)
    shortcutTargets.set('C:/Games/Bad.url', 'https://example.com')
    await expect(runner.launch(id)).rejects.toMatchObject({ code: 'shortcut-invalid' })
    expect(games().getById(id)?.timeLastPlayed).toBeNull()
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

describe('game runner: following the game window (D-37)', () => {
  const sessions = (id: number): { startedAt: string; endedAt: string | null }[] =>
    db
      .prepare('SELECT started_at, ended_at FROM play_sessions WHERE game_id = ? ORDER BY id')
      .all(id)
      .map((row) => {
        const { started_at, ended_at } = row as { started_at: string; ended_at: string | null }
        return { startedAt: started_at, endedAt: ended_at }
      })
  const addShortcut = (title: string): number => {
    const game = games().create({ origin: 'manual', title, installed: true })
    createLaunchConfigRepository(db).save({
      gameId: game.id,
      executablePath: `C:/Games/${title}.url`,
      romPath: null,
      arguments: [],
      workingDirectory: null
    })
    shortcutTargets.set(`C:/Games/${title}.url`, 'com.epicgames.launcher://apps/x?action=launch')
    return game.id
  }

  it('Minecraft: its own window, it ends, then the game in a new process is followed', async () => {
    const id = addManualGame()
    await runner.launch(id)
    // Measured (owner's report): the process started shows a window, then hands off and ends.
    alive.add(4242)
    showWindow(4242)
    clock = new Date('2026-11-02T10:00:07Z')
    alive.delete(4242)
    exitProcess()
    await flush()
    expect(runner.runningGameIds()).toEqual([id])

    clock = new Date('2026-11-02T10:00:10Z')
    alive.add(777)
    showWindow(777)
    clock = new Date('2026-11-02T10:30:00Z')
    fire(60_000)
    fire(2000)
    expect(runner.runningGameIds()).toEqual([id])

    alive.delete(777)
    clock = new Date('2026-11-02T10:45:00Z')
    fire(2000)
    expect(runner.runningGameIds()).toEqual([])
    expect(sessions(id)).toEqual([
      { startedAt: '2026-11-02T10:00:00Z', endedAt: '2026-11-02T10:45:00Z' }
    ])
    expect(games().getById(id)?.playtime).toBe(45)
    // Nothing is watched any more.
    expect(windowWatchers.size).toBe(0)
  })

  it('a launcher that stays open hands over when it ends, to the game window it opened', async () => {
    const id = addManualGame()
    await runner.launch(id)
    alive.add(777)
    showWindow(777)
    clock = new Date('2026-11-02T10:00:20Z')
    exitProcess()
    await flush()
    alive.delete(777)
    clock = new Date('2026-11-02T10:20:00Z')
    fire(2000)
    // Within the wait: it may restart, so the session waits; once the wait ends, it closes.
    fire(60_000)
    expect(sessions(id)).toEqual([
      { startedAt: '2026-11-02T10:00:00Z', endedAt: '2026-11-02T10:20:00Z' }
    ])
  })

  it('without another window, closes when the process ended, once the wait is over', async () => {
    const id = addManualGame()
    await runner.launch(id)
    clock = new Date('2026-11-02T10:00:01Z')
    exitProcess()
    await flush()
    clock = new Date('2026-11-02T10:01:00Z')
    fire(60_000)
    expect(runner.runningGameIds()).toEqual([])
    expect(sessions(id)).toEqual([
      { startedAt: '2026-11-02T10:00:00Z', endedAt: '2026-11-02T10:00:01Z' }
    ])
  })

  it('a game played past the wait closes at once when it ends, as before', async () => {
    const id = addManualGame()
    await runner.launch(id)
    fire(60_000)
    showWindow(777)
    clock = new Date('2026-11-02T11:00:00Z')
    exitProcess()
    await flush()
    expect(runner.runningGameIds()).toEqual([])
    expect(games().getById(id)?.playtime).toBe(60)
  })

  it('times a .url shortcut from its game window to the end of that process', async () => {
    const id = addShortcut('Fortnite')
    await runner.launch(id)
    expect(runner.runningGameIds()).toEqual([])

    // The store launcher takes its time; its own process is left out by the watcher.
    clock = new Date('2026-11-02T10:02:00Z')
    alive.add(888)
    showWindow(888)
    expect(runner.runningGameIds()).toEqual([id])

    fire(180_000)
    alive.delete(888)
    clock = new Date('2026-11-02T11:12:00Z')
    fire(2000)
    expect(sessions(id)).toEqual([
      { startedAt: '2026-11-02T10:02:00Z', endedAt: '2026-11-02T11:12:00Z' }
    ])
    expect(games().getById(id)?.playtime).toBe(70)
  })

  it('a .url shortcut whose game window never shows gets no session', async () => {
    const id = addShortcut('Epic')
    await runner.launch(id)
    fire(180_000)
    showWindow(888)
    expect(sessions(id)).toEqual([])
    expect(games().getById(id)?.timeLastPlayed).toBe('2026-11-02T10:00:00Z')
    expect(windowWatchers.size).toBe(0)
  })

  it('watches nothing for a ROM game', async () => {
    const game = games().create({ origin: 'yuzu', title: 'Zelda', installed: true })
    createLaunchConfigRepository(db).save({
      gameId: game.id,
      executablePath: null,
      romPath: 'D:/Switch/Zelda.nsp',
      arguments: [],
      workingDirectory: null
    })
    createEmulatorRepository(db).set('yuzu', 'C:/Yuzu/yuzu.exe')
    existing.add('C:/Yuzu/yuzu.exe')
    await runner.launch(game.id)
    expect(windowWatchers.size).toBe(0)
  })
})
