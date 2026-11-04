import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PreparedArtwork } from './import-artwork'

const TYPES = ['jpg', 'png', 'webp'] as const

/**
 * Icons live under the game's cache folder, `<gameId>/achievements/<id>[-locked].<type>`,
 * so removing a game's artwork removes them too. Paths are built from database
 * ids only, never from remote data.
 */
const folderOf = (cacheDir: string, gameId: number): string =>
  join(cacheDir, String(gameId), 'achievements')

const baseName = (achievementId: number, locked: boolean): string =>
  locked ? `${achievementId}-locked` : String(achievementId)

/** The cached icon file of an achievement, or null when it was not downloaded yet. */
export function achievementIconPath(
  cacheDir: string,
  gameId: number,
  achievementId: number,
  locked: boolean
): string | null {
  for (const type of TYPES) {
    const file = join(folderOf(cacheDir, gameId), `${baseName(achievementId, locked)}.${type}`)
    if (existsSync(file)) return file
  }
  return null
}

export function writeAchievementIcon(
  cacheDir: string,
  gameId: number,
  achievementId: number,
  locked: boolean,
  icon: PreparedArtwork
): void {
  const folder = folderOf(cacheDir, gameId)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, `${baseName(achievementId, locked)}.${icon.type}`), icon.bytes)
}
