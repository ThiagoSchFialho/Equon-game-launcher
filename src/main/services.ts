import { nativeImage, shell, type BrowserWindow } from 'electron'
import { readdir, readFile } from 'node:fs/promises'
import {
  createGameRunner,
  createSteamSessions,
  recoverInterruptedSessions
} from '../core/application'
import { isAllowedShortcutUrl, isSteamRunUrl } from '../core/domain'
import { readShortcutUrl } from '../infrastructure/filesystem/shortcut-reader'
import { createFileInspector } from '../infrastructure/filesystem/file-inspector'
import {
  createAchievementRepository,
  createArtworkRepository,
  createEmulatorRepository,
  createGameRepository,
  createGenreRepository,
  createLaunchConfigRepository,
  createOriginRepository,
  createSessionRepository,
  createUnitOfWork,
  createUserRepository,
  type SqliteDatabase
} from '../infrastructure/persistence'
import { createProcessLauncher } from '../infrastructure/process/process-launcher'
import { readSteamRegistryValue } from '../integrations/steam/registry'
import { createSteamAdapter } from '../integrations/steam/steam-adapter'
import { IpcEvent } from '../shared/ipc/contract'
import { createManualGameService } from './games/manual-game-service'
import type { IpcDeps } from './ipc/register'
import type { SecretCipher } from './settings/settings-service'
import { createSettingsService } from './settings/settings-service'
import { createSteamService } from './steam/steam-service'

/** Heartbeat interval for running sessions (DATA_BASE_CONTEXT.md §3.8). */
const HEARTBEAT_MS = 30_000
/** How long Steam may take to report a launched game running (first guess; measure). */
const STEAM_START_TIMEOUT_MS = 90_000

/** Full decode with Electron; the real size or null when the image cannot be decoded. */
function decodeImage(bytes: Buffer): { width: number; height: number } | null {
  const image = nativeImage.createFromBuffer(bytes)
  return image.isEmpty() ? null : image.getSize()
}

/**
 * Composition root for the main process: repositories, use cases and the
 * services behind IPC. Sessions left running by a previous run are closed
 * here, before anything else reads playtime (D-08).
 */
export function createServices(
  db: SqliteDatabase,
  artworkCacheDir: string,
  window: () => BrowserWindow | null,
  cipher: SecretCipher
): IpcDeps {
  const games = createGameRepository(db)
  const configs = createLaunchConfigRepository(db)
  const sessions = createSessionRepository(db)
  const origins = createOriginRepository(db)
  const artwork = createArtworkRepository(db)
  const emulators = createEmulatorRepository(db)
  const uow = createUnitOfWork(db)
  const inspector = createFileInspector()

  recoverInterruptedSessions({ games, sessions, uow })

  const clock = { now: () => new Date() }
  const repeat = (ms: number, tick: () => void): (() => void) => {
    const timer = setInterval(tick, ms)
    return () => clearInterval(timer)
  }
  const sendRunning = (): void =>
    window()?.webContents.send(IpcEvent.gamesRunningChanged, runner.runningGameIds())

  const adapter = createSteamAdapter({
    fs: { readText: (path) => readFile(path, 'utf8'), listDir: (path) => readdir(path) },
    readSteamPath: () => readSteamRegistryValue('SteamPath'),
    isFile: (path) => inspector.stateOf(path) === 'file'
  })
  const steamSessions = createSteamSessions({
    games,
    sessions,
    uow,
    clock,
    repeat,
    after: (ms, fn) => {
      const timer = setTimeout(fn, ms)
      return () => clearTimeout(timer)
    },
    heartbeatMs: HEARTBEAT_MS,
    onChange: () => sendRunning(),
    onError: (error) => console.error('Steam session error:', error)
  })

  const runner = createGameRunner({
    games,
    configs,
    sessions,
    emulators,
    uow,
    launcher: createProcessLauncher(),
    shortcuts: {
      readUrl: readShortcutUrl,
      // Re-checked here: only allowlisted store URLs ever reach the OS (ARCHITECTURE.md §7).
      openUrl: async (url) => {
        if (!isAllowedShortcutUrl(url)) throw new Error('URL not allowed')
        await shell.openExternal(url)
      }
    },
    inspector,
    clock,
    repeat,
    heartbeatMs: HEARTBEAT_MS,
    onRunningChanged: () => sendRunning(),
    onError: (error) => console.error('Could not close a play session:', error),
    steam: {
      sessions: steamSessions,
      // Only steam://rungameid/<appid> built from a validated App ID (D-17, ARCHITECTURE.md §7).
      openRunUrl: async (url) => {
        if (!isSteamRunUrl(url)) throw new Error('URL not allowed')
        await shell.openExternal(url)
      },
      liveState: (appId) => adapter.liveState(appId),
      startTimeoutMs: STEAM_START_TIMEOUT_MS
    }
  })

  const steam = createSteamService({
    games,
    uow,
    adapter,
    sessions: steamSessions,
    readRunningAppId: () => readSteamRegistryValue('RunningAppID'),
    clock,
    onLibraryChanged: () => window()?.webContents.send(IpcEvent.libraryChanged),
    onError: (error) => console.error('Steam error:', error)
  })

  return {
    queries: {
      games,
      origins,
      artwork,
      genres: createGenreRepository(db),
      achievements: createAchievementRepository(db),
      configs,
      emulators,
      inspector,
      steamLiveState: (appId) => adapter.liveState(appId)
    },
    service: createManualGameService({
      games,
      configs,
      origins,
      emulators,
      artwork,
      uow,
      inspector,
      runner,
      artworkCacheDir,
      decodeImage,
      readShortcut: readShortcutUrl
    }),
    runner,
    window,
    steam,
    settings: createSettingsService({
      users: createUserRepository(db),
      cipher,
      steam,
      steamPath: () => adapter.steamPath()
    })
  }
}
