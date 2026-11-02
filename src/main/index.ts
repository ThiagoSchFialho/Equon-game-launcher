import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { openAppDatabase, type SqliteDatabase } from '../infrastructure/persistence'
import { registerIpcHandlers } from './ipc/register'
import { hardenApp } from './security/harden'
import type { AppOrigin } from './security/navigation'

const rendererFile = join(__dirname, '../renderer/index.html')
const devServerUrl = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined

const appOrigin: AppOrigin = {
  devServerUrl,
  rendererFileUrl: pathToFileURL(rendererFile).href
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  if (devServerUrl !== undefined) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(rendererFile)
  }
}

let db: SqliteDatabase | undefined

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.equon.launcher')

  // The database is required; without it the launcher cannot work.
  try {
    db = openAppDatabase(join(app.getPath('userData'), 'equon.sqlite')).db
  } catch (error) {
    dialog.showErrorBox('Equon', `Could not open the local database.\n\n${String(error)}`)
    app.quit()
    return
  }

  // F12 toggles DevTools in development; reload shortcuts are ignored in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  hardenApp(appOrigin)
  registerIpcHandlers(appOrigin)
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  db?.close()
})
