import { app, BrowserWindow, dialog, safeStorage } from 'electron'
import { release, version } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  createArtworkRepository,
  openAppDatabase,
  schemaVersion,
  type SqliteDatabase
} from '../infrastructure/persistence'
import { handleArtworkProtocol, registerArtworkScheme } from './artwork/artwork-protocol'
import { registerIpcHandlers } from './ipc/register'
import { hardenApp } from './security/harden'
import { createServices } from './services'
import type { SteamService } from './steam/steam-service'
import type { AppOrigin } from './security/navigation'

// Unpackaged runs (dev, preview) use their own data folder so they never
// touch the real library.
if (is.dev) {
  app.setPath('userData', join(app.getPath('appData'), 'equon-game-launcher-dev'))
}

registerArtworkScheme()

const rendererFile = join(__dirname, '../renderer/index.html')
const devServerUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined

const appOrigin: AppOrigin = {
  devServerUrl,
  rendererFileUrl: pathToFileURL(rendererFile).href
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#101216',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })

  const window = mainWindow
  window.on('ready-to-show', () => window.show())
  window.on('closed', () => {
    mainWindow = null
  })

  if (devServerUrl !== undefined) {
    window.loadURL(devServerUrl)
  } else {
    window.loadFile(rendererFile)
  }
}

let db: SqliteDatabase | undefined
let steam: SteamService | undefined

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.equon.launcher')

  const userData = app.getPath('userData')
  const artworkCacheDir = join(userData, 'artwork-cache')

  // The database is required; without it the launcher cannot work.
  try {
    db = openAppDatabase(join(userData, 'equon.sqlite')).db
  } catch (error) {
    dialog.showErrorBox('Equon', `Could not open the local database.\n\n${String(error)}`)
    app.quit()
    return
  }

  if (import.meta.env.DEV && process.argv.includes('--seed')) {
    const { seedDevData } = await import('../infrastructure/persistence/dev/seed')
    seedDevData(db, userData, artworkCacheDir)
  }

  // F12 toggles DevTools in development; reload shortcuts are ignored in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  hardenApp(appOrigin)
  handleArtworkProtocol(createArtworkRepository(db), artworkCacheDir)
  const database = db
  const services = createServices(db, artworkCacheDir, () => mainWindow, {
    // Windows DPAPI through safeStorage (D-04); keys never leave main in clear text.
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (encrypted) => safeStorage.decryptString(Buffer.from(encrypted))
  })
  registerIpcHandlers(appOrigin, {
    ...services,
    systemInfo: () => ({
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      os: `${version()} (${release()})`,
      dataPath: userData,
      schemaVersion: schemaVersion(database)
    })
  })
  createWindow()
  // Local Steam scan and running-game watcher (D-12); a failure never blocks the app.
  steam = services.steam
  steam.start()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  steam?.stop()
  db?.close()
})
