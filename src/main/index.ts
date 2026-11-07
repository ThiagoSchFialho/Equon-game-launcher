import { app, BrowserWindow, dialog, Menu, safeStorage } from 'electron'
import { execFile } from 'child_process'
import { release, version } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  createAchievementRepository,
  createArtworkRepository,
  openAppDatabase,
  schemaVersion,
  type SqliteDatabase
} from '../infrastructure/persistence'
import { APP_MENU } from './app-menu'
import { handleArtworkProtocol, registerArtworkScheme } from './artwork/artwork-protocol'
import { describeDatabaseFailure } from './database-failure'
import { registerIpcHandlers } from './ipc/register'
import { createCrashPolicy } from './renderer-recovery'
import { hardenApp } from './security/harden'
import { createServices } from './services'
import { createSystemControl } from './system/system-control'
import type { SteamService } from './steam/steam-service'
import type { AppOrigin } from './security/navigation'

// In fullscreen, DirectComposition could leave one-off updates (a tab switch, a
// screen without focus animation) unpresented until the next change on screen
// (ARCHITECTURE.md §12). Must be set before the app is ready.
app.commandLine.appendSwitch('disable-direct-composition')
// Also in fullscreen, an image drawn for the first time could stay blank until the next
// change on it, although it had loaded: raster now waits for the decode (ARCHITECTURE.md §12).
app.commandLine.appendSwitch('disable-checker-imaging')

// Unpackaged runs (dev, preview) use their own data folder so they never
// touch the real library.
if (is.dev) {
  app.setPath('userData', join(app.getPath('appData'), 'equon-game-launcher-dev'))
} else if (!app.commandLine.hasSwitch('user-data-dir')) {
  // Fixed here: by default it would follow the product name in the installer settings,
  // and renaming the product would look like losing the whole library.
  app.setPath('userData', join(app.getPath('appData'), 'equon-game-launcher'))
}

// One launcher per data folder: a second one would close the first one's running
// sessions as interrupted and count everything twice. Comes after the folder is chosen.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) app.quit()

registerArtworkScheme()

const rendererFile = join(__dirname, '../renderer/index.html')
const devServerUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined

const appOrigin: AppOrigin = {
  devServerUrl,
  rendererFileUrl: pathToFileURL(rendererFile).href
}

let mainWindow: BrowserWindow | null = null
const crashPolicy = createCrashPolicy(() => Date.now())

// Launching it again brings back the one already open.
app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function createWindow(startFullscreen: boolean): void {
  mainWindow = new BrowserWindow({
    // Also the size F11 goes back to when it opens in fullscreen.
    width: 1280,
    height: 720,
    fullscreen: startFullscreen,
    show: false,
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
  // Hidden for good, even with Alt; the shortcuts of the menu keep working.
  window.setMenuBarVisibility(false)
  window.on('ready-to-show', () => {
    window.show()
    // Opened with Windows, showing it is not enough to get the focus, and the controller needs it.
    window.focus()
  })
  // Coming back from Steam: no need to wait for the next check.
  window.on('focus', () => void steam?.rescan())
  window.on('closed', () => {
    mainWindow = null
  })

  const load = (): void => {
    if (devServerUrl !== undefined) void window.loadURL(devServerUrl)
    else void window.loadFile(rendererFile)
  }
  window.webContents.on('render-process-gone', (_, { reason }) => {
    if (reason === 'clean-exit') return
    console.error('Renderer process gone:', reason)
    if (crashPolicy.onCrash() === 'reload') {
      load()
      return
    }
    dialog.showErrorBox('Equon', 'A tela do Equon parou de funcionar. Abra o Equon novamente.')
    app.quit()
  })
  load()
}

let db: SqliteDatabase | undefined
let steam: SteamService | undefined

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return
  electronApp.setAppUserModelId('com.equon.launcher')
  if (!is.dev) Menu.setApplicationMenu(Menu.buildFromTemplate(APP_MENU))

  const userData = app.getPath('userData')
  const artworkCacheDir = join(userData, 'artwork-cache')

  // The database is required; without it the launcher cannot work.
  const databaseFile = join(userData, 'equon.sqlite')
  try {
    db = openAppDatabase(databaseFile).db
  } catch (error) {
    dialog.showErrorBox('Equon', describeDatabaseFailure(error, databaseFile))
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
  const database = db
  const services = createServices(
    db,
    artworkCacheDir,
    () => mainWindow,
    {
      // Windows DPAPI through safeStorage (D-04); keys never leave main in clear text.
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain),
      decrypt: (encrypted) => safeStorage.decryptString(Buffer.from(encrypted))
    },
    {
      // D-20. Windows owns this state, including an entry turned off in the Task Manager.
      available: () => app.isPackaged,
      enabled: () => app.getLoginItemSettings().executableWillLaunchAtLogin,
      setEnabled: (enabled) => app.setLoginItemSettings({ openAtLogin: enabled })
    }
  )
  handleArtworkProtocol(
    createArtworkRepository(db),
    createAchievementRepository(db),
    artworkCacheDir,
    services.artworkEditor
  )
  registerIpcHandlers(appOrigin, {
    ...services,
    system: createSystemControl({
      window: () => mainWindow,
      isGameRunning: () => services.runner.runningGameIds().length > 0,
      run: (file, args) =>
        new Promise((resolve, reject) => {
          execFile(file, [...args], { windowsHide: true }, (error) =>
            error ? reject(error) : resolve()
          )
        }),
      quit: () => app.quit(),
      systemRoot: process.env['SystemRoot']
    }),
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
  createWindow(services.users.getStartFullscreen())
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
