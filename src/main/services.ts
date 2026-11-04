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
import { createFetchBytes, fetchGet } from '../integrations/http'
import { MAX_ARTWORK_BYTES, webpSize } from '../infrastructure/artwork/import-artwork'
import { createAchievementSync } from './achievements/achievement-sync'
import { createArtworkFetcher } from './artwork/artwork-fetcher'
import { IpcEvent } from '../shared/ipc/contract'
import { createManualGameService } from './games/manual-game-service'
import type { IpcDeps } from './ipc/register'
import type { SecretCipher } from './settings/settings-service'
import { createSettingsService } from './settings/settings-service'
import { createSteamOnline } from './steam/steam-online'
import { createSteamService } from './steam/steam-service'

/** Heartbeat interval for running sessions (DATA_BASE_CONTEXT.md §3.8). */
const HEARTBEAT_MS = 30_000
/** How long Steam may take to report a launched game running (first guess; measure). */
const STEAM_START_TIMEOUT_MS = 90_000
/** Steam updates a game that needs it before starting it. */
const STEAM_UPDATE_TIMEOUT_MS = 10 * 60_000

/**
 * Full decode with Electron for PNG and JPEG; WebP (which nativeImage cannot
 * decode) is checked through its header. Null when the image is not valid.
 */
function decodeImage(bytes: Buffer): { width: number; height: number } | null {
  const image = nativeImage.createFromBuffer(bytes)
  return image.isEmpty() ? webpSize(bytes) : image.getSize()
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
  const achievements = createAchievementRepository(db)
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
    // Only the game that just closed (DATA_BASE_CONTEXT.md §5).
    onClosed: (gameId) => void achievementSync.syncAfterClose(gameId),
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
      startTimeoutMs: STEAM_START_TIMEOUT_MS,
      updateTimeoutMs: STEAM_UPDATE_TIMEOUT_MS
    }
  })

  const users = createUserRepository(db)
  const genres = createGenreRepository(db)
  const secret = (kind: 'steam-api-key' | 'steamgriddb-api-key'): string | null => {
    const encrypted = users.getSecret(kind)
    if (encrypted === null) return null
    try {
      return cipher.decrypt(encrypted)
    } catch {
      return null
    }
  }
  const steamOnline = createSteamOnline({
    games,
    genres,
    uow,
    get: fetchGet,
    credentials: () => ({
      steamId: users.getSteamId(),
      steamKey: secret('steam-api-key'),
      gridKey: secret('steamgriddb-api-key')
    }),
    clock,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onLibraryChanged: () => window()?.webContents.send(IpcEvent.libraryChanged),
    // Messages only: request URLs (which may hold keys) are never logged.
    onError: (error) => console.error('Steam request failed:', String(error))
  })

  const achievementSync = createAchievementSync({
    games,
    achievements,
    users,
    uow,
    get: fetchGet,
    getBytes: createFetchBytes(MAX_ARTWORK_BYTES),
    credentials: () => ({ steamId: users.getSteamId(), steamKey: secret('steam-api-key') }),
    cacheDir: artworkCacheDir,
    decode: decodeImage,
    clock,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onChanged: () => window()?.webContents.send(IpcEvent.achievementsChanged),
    // Messages only: request URLs (which may hold keys) are never logged.
    onError: (error) => console.error('Achievement sync failed:', String(error))
  })

  const artworkFetcher = createArtworkFetcher({
    games,
    artwork,
    get: fetchGet,
    getBytes: createFetchBytes(MAX_ARTWORK_BYTES),
    gridKey: () => secret('steamgriddb-api-key'),
    cacheDir: artworkCacheDir,
    decode: decodeImage,
    clock,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onLibraryChanged: () => window()?.webContents.send(IpcEvent.libraryChanged),
    onError: (error) => console.error('Artwork download failed:', String(error))
  })

  const steam = createSteamService({
    games,
    uow,
    adapter,
    sessions: steamSessions,
    readRunningAppId: () => readSteamRegistryValue('RunningAppID'),
    clock,
    onLibraryChanged: () => window()?.webContents.send(IpcEvent.libraryChanged),
    onError: (error) => console.error('Steam error:', error),
    // Startup: playtime sync once (after interrupted sessions and the scan), then metadata.
    afterScan: (first) => {
      const sync = first ? steamOnline.syncPlaytime() : Promise.resolve(null)
      void sync
        .catch((error) => console.error('Steam sync failed:', String(error)))
        .then(() => steamOnline.fetchMissingMetadata())
        .catch((error) => console.error('Steam metadata failed:', String(error)))
        .then(() => artworkFetcher.fetchMissing())
        .catch((error) => console.error('Artwork queue failed:', String(error)))
    }
  })

  return {
    queries: {
      games,
      origins,
      artwork,
      genres,
      achievements,
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
    steamOnline,
    artworkFetcher,
    achievementSync,
    users,
    artworkCacheDir,
    settings: createSettingsService({
      users,
      lastSync: () => steamOnline.lastSync(),
      cipher,
      steam,
      steamPath: () => adapter.steamPath()
    })
  }
}
