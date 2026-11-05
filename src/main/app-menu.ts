import type { MenuItemConstructorOptions } from 'electron'

/**
 * Installed runs replace Electron's default menu, which offers DevTools, reload, zoom and
 * close to a launcher driven by a controller: a stray Ctrl+R restarts the interface and
 * zoom breaks the layout. The menu bar stays hidden; only these shortcuts remain.
 */
export const APP_MENU: MenuItemConstructorOptions[] = [
  { label: 'Equon', submenu: [{ role: 'togglefullscreen' }] },
  {
    // The text fields need these: Ctrl+V reaches the page through the paste role.
    label: 'Editar',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  }
]
