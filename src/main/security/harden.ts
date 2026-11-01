import { app, session } from 'electron'
import { isAppUrl, type AppOrigin } from './navigation'

/**
 * Applies the window security rules from ARCHITECTURE.md §6/§7 to every
 * webContents the app creates. Call once, before any window is created.
 */
export function hardenApp(origin: AppOrigin): void {
  // No feature the launcher uses needs a permission prompt (the Gamepad API does not).
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  session.defaultSession.setPermissionCheckHandler(() => false)

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url, origin)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!isAppUrl(url, origin)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    // External URLs are opened only by main, from an allowlist (none yet).
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
}
