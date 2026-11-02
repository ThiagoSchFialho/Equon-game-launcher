import { existsSync, readdirSync } from 'node:fs'
import { dirname, extname, join, parse, resolve } from 'node:path'
import { EMULATORS } from '../../core/domain'

/** What the user is picking; decides which files are listed. */
export type PickKind = 'executable' | 'emulator' | 'rom' | 'image' | 'directory'

export const PICK_EXTENSIONS: Record<PickKind, readonly string[] | null> = {
  // Games: a native executable or a store .url shortcut.
  executable: ['.exe', '.url'],
  emulator: ['.exe'],
  // Yuzu is the only supported emulator (DATA_BASE_CONTEXT.md §3.12).
  rom: EMULATORS.yuzu.romExtensions,
  image: ['.png', '.jpg', '.jpeg', '.webp'],
  directory: []
}

export interface BrowserEntry {
  name: string
  path: string
  type: 'directory' | 'file'
}

export interface BrowserListing {
  /** null = the root view (drives and known folders). */
  path: string | null
  parent: string | null
  entries: BrowserEntry[]
  /** True when the listing was cut at MAX_ENTRIES. */
  truncated: boolean
}

export const MAX_ENTRIES = 2000

/** Drives that exist, A: to Z:. */
export function listDrives(exists: (path: string) => boolean = existsSync): BrowserEntry[] {
  const drives: BrowserEntry[] = []
  for (let code = 65; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`
    if (exists(root)) drives.push({ name: root, path: root, type: 'directory' })
  }
  return drives
}

/**
 * Lists a folder for the controller-friendly file browser
 * (ARCHITECTURE.md §3.13): folder names and only files with the allowed
 * extensions; never file contents. Hidden-by-convention entries ($Recycle.Bin,
 * System Volume Information, names starting with ".") are skipped.
 */
export function listDirectory(path: string, kind: PickKind): BrowserListing {
  const dir = resolve(path)
  const allowed = PICK_EXTENSIONS[kind]
  const entries: BrowserEntry[] = []
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    const name = dirent.name
    if (name.startsWith('$') || name.startsWith('.') || name === 'System Volume Information')
      continue
    if (dirent.isDirectory()) {
      entries.push({ name, path: join(dir, name), type: 'directory' })
    } else if (
      dirent.isFile() &&
      kind !== 'directory' &&
      (allowed === null || allowed.includes(extname(name).toLowerCase()))
    ) {
      entries.push({ name, path: join(dir, name), type: 'file' })
    }
  }
  entries.sort(
    (a, b) =>
      (a.type === b.type ? 0 : a.type === 'directory' ? -1 : 1) ||
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true })
  )
  const isRoot = parse(dir).root === dir
  return {
    path: dir,
    parent: isRoot ? null : dirname(dir),
    entries: entries.slice(0, MAX_ENTRIES),
    truncated: entries.length > MAX_ENTRIES
  }
}

/** True when `path` has an extension allowed for `kind` (re-checked in main on save). */
export function matchesPickKind(path: string, kind: PickKind): boolean {
  const allowed = PICK_EXTENSIONS[kind]
  if (kind === 'directory') return false
  return allowed === null || allowed.includes(extname(path).toLowerCase())
}
