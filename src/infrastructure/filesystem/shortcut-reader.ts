import { readFileSync, statSync } from 'node:fs'
import { parseInternetShortcut } from '../../core/domain'

/** Real .url files are a few hundred bytes; anything larger is not a shortcut. */
const MAX_SHORTCUT_BYTES = 64 * 1024

/** Reads the URL= target of a Windows internet shortcut; null if unreadable or absent. */
export function readShortcutUrl(path: string): string | null {
  try {
    if (statSync(path).size > MAX_SHORTCUT_BYTES) return null
    return parseInternetShortcut(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
