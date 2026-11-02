import { nativeImage, type BrowserWindow } from 'electron'
import { createGameRunner, recoverInterruptedSessions } from '../core/application'
import { createFileInspector } from '../infrastructure/filesystem/file-inspector'
import {
  createAchievementRepository,
  createArtworkRepository,
  createGameRepository,
  createGenreRepository,
  createLaunchConfigRepository,
  createOriginRepository,
  createSessionRepository,
  createUnitOfWork,
  type SqliteDatabase
} from '../infrastructure/persistence'
import { createProcessLauncher } from '../infrastructure/process/process-launcher'
import { IpcEvent } from '../shared/ipc/contract'
import { createManualGameService } from './games/manual-game-service'
import type { IpcDeps } from './ipc/register'

/** Heartbeat interval for running sessions (DATA_BASE_CONTEXT.md §3.8). */
const HEARTBEAT_MS = 30_000

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
  window: () => BrowserWindow | null
): IpcDeps {
  const games = createGameRepository(db)
  const configs = createLaunchConfigRepository(db)
  const sessions = createSessionRepository(db)
  const origins = createOriginRepository(db)
  const artwork = createArtworkRepository(db)
  const uow = createUnitOfWork(db)
  const inspector = createFileInspector()

  recoverInterruptedSessions({ games, sessions, uow })

  const runner = createGameRunner({
    games,
    configs,
    sessions,
    uow,
    launcher: createProcessLauncher(),
    clock: { now: () => new Date() },
    repeat: (ms, tick) => {
      const timer = setInterval(tick, ms)
      return () => clearInterval(timer)
    },
    heartbeatMs: HEARTBEAT_MS,
    onRunningChanged: (ids) => window()?.webContents.send(IpcEvent.gamesRunningChanged, ids),
    onError: (error) => console.error('Could not close a play session:', error)
  })

  return {
    queries: {
      games,
      origins,
      artwork,
      genres: createGenreRepository(db),
      achievements: createAchievementRepository(db),
      configs,
      inspector
    },
    service: createManualGameService({
      games,
      configs,
      origins,
      artwork,
      uow,
      inspector,
      runner,
      artworkCacheDir,
      decodeImage
    }),
    runner,
    window
  }
}
