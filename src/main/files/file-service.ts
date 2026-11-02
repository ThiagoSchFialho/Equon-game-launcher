import { app, dialog, type BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { isAbsoluteWindowsPath } from '../../core/application'
import {
  PICK_EXTENSIONS,
  listDirectory,
  listDrives,
  matchesPickKind
} from '../../infrastructure/filesystem/file-browser'
import type { BrowserListing, PickKind, Result } from '../../shared/ipc/contract'

const KNOWN_FOLDERS = ['desktop', 'downloads', 'documents', 'home'] as const

/** Starting view: a few known folders, then the drives. */
function rootListing(): BrowserListing {
  const known = KNOWN_FOLDERS.map((name) => app.getPath(name))
    .filter((path, i, all) => existsSync(path) && all.indexOf(path) === i)
    .map((path) => ({ name: basename(path), path, type: 'directory' as const }))
  return { path: null, parent: null, entries: [...known, ...listDrives()], truncated: false }
}

/** Lists folders for the controller-friendly file browser (ARCHITECTURE.md §3.13). */
export function listFiles(path: string | null, kind: PickKind): Result<BrowserListing> {
  if (path === null) return { ok: true, data: rootListing() }
  if (!isAbsoluteWindowsPath(path)) return { ok: false, error: { code: 'not-absolute' } }
  try {
    // At a drive root parent is null: "up" goes back to the starting view.
    return { ok: true, data: listDirectory(path, kind) }
  } catch {
    return { ok: false, error: { code: 'unreadable' } }
  }
}

/** Native dialog for mouse/keyboard users; the path is checked like any other. */
export async function pickNative(
  window: BrowserWindow | null,
  kind: PickKind
): Promise<string | null> {
  const extensions = PICK_EXTENSIONS[kind]
  const options: Electron.OpenDialogOptions = {
    properties: [kind === 'directory' ? 'openDirectory' : 'openFile'],
    filters:
      kind === 'directory' || extensions === null
        ? undefined
        : [{ name: kind, extensions: extensions.map((e) => e.slice(1)) }]
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  const picked = result.canceled ? undefined : result.filePaths[0]
  if (!picked) return null
  if (kind !== 'directory' && !matchesPickKind(picked, kind)) return null
  return picked
}
