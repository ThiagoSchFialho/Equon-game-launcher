import { isAbsolute, relative, resolve } from 'node:path'

/**
 * Resolves `untrusted` against `root` and returns the absolute path only when
 * it stays inside `root`. Absolute paths, `..` escapes and other drives are
 * rejected. Used for stored relative paths such as GAME_ARTWORK.local_path.
 */
export function resolveInside(root: string, untrusted: string): string | null {
  if (untrusted === '' || isAbsolute(untrusted)) return null
  const base = resolve(root)
  const target = resolve(base, untrusted)
  const rel = relative(base, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return target
}
