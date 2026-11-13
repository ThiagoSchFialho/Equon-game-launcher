import { opendir, stat } from 'node:fs/promises'
import { join, parse, resolve } from 'node:path'

/** Stop after this many files or this long (owner-approved plan, D-34): the size is "at least". */
export const FOLDER_SIZE_MAX_FILES = 200_000
export const FOLDER_SIZE_MAX_MS = 30_000

export type FolderSize =
  | { status: 'ok'; bytes: number; truncated: boolean }
  /** A drive root or a system folder: summing it would not be the game's size. */
  | { status: 'refused' }
  | { status: 'unreadable' }

/** The same folder, however it is spelled: Windows paths are case-insensitive. */
export const folderKey = (path: string): string =>
  resolve(path)
    .replace(/[\\/]+$/, '')
    .toLowerCase()

/**
 * Whether a game folder can be summed (D-34): never a drive root, nor a folder that holds far
 * more than one game (Program Files, Windows, the user's home, Desktop, Downloads, Documents),
 * passed in by main from the system's own locations.
 */
export function isSummableFolder(path: string, systemFolders: readonly string[]): boolean {
  const key = folderKey(path)
  if (key === folderKey(parse(resolve(path)).root)) return false
  return !systemFolders.some((folder) => folderKey(folder) === key)
}

/**
 * Sums the files under `path`, read-only. Links and junctions are not followed (lstat-like
 * entries from opendir), so nothing is counted twice and no other drive is entered. Folders it
 * cannot read are skipped; only an unreadable root is "unreadable". Past the file or time limit
 * it stops and reports what it had as truncated. `signal` stops it early, as truncated.
 */
export async function folderSize(
  path: string,
  options: { maxFiles?: number; maxMs?: number; now?: () => number; signal?: AbortSignal } = {}
): Promise<FolderSize> {
  const maxFiles = options.maxFiles ?? FOLDER_SIZE_MAX_FILES
  const maxMs = options.maxMs ?? FOLDER_SIZE_MAX_MS
  const now = options.now ?? Date.now
  const started = now()
  let bytes = 0
  let files = 0
  let truncated = false

  try {
    await opendir(path).then((dir) => dir.close())
  } catch {
    return { status: 'unreadable' }
  }

  const pending: string[] = [path]
  while (pending.length > 0 && !truncated) {
    const folder = pending.pop() as string
    let dir
    try {
      dir = await opendir(folder)
    } catch {
      continue
    }
    for await (const entry of dir) {
      if (files >= maxFiles || now() - started > maxMs || options.signal?.aborted) {
        truncated = true
        break
      }
      const full = join(folder, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        pending.push(full)
      } else if (entry.isFile()) {
        files++
        try {
          bytes += (await stat(full)).size
        } catch {
          // A file that vanished or is locked: the rest still counts.
        }
      }
    }
    if (truncated) await dir.close().catch(() => {})
  }
  return { status: 'ok', bytes, truncated }
}
