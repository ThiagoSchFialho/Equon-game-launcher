import { statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { GameRepository, LaunchConfigRepository } from '../../core/application'
import { BuiltinOrigin, type Game } from '../../core/domain'
import {
  folderKey,
  folderSize,
  isSummableFolder,
  type FolderSize
} from '../../infrastructure/filesystem/folder-size'
import type { GameSizeInfo } from '../../shared/ipc/contract'

export interface GameSizesDeps {
  games: GameRepository
  configs: LaunchConfigRepository
  /** The Steam adapter's sizes from the manifests of its last scan (D-34). */
  steamSizes(): Promise<Map<number, { bytes: number; manifest: string }>>
  /** Folders far larger than one game (Program Files, the user's home…); never summed. */
  systemFolders: readonly string[]
  /** Injected for tests; the real ones read the disk. */
  fileSize?: (path: string) => number | null
  sumFolder?: (path: string) => Promise<FolderSize>
}

export interface GameSizes {
  /**
   * Every installed game with its drive and, when it is known at once, its size: Steam from its
   * manifest and a ROM from its file are exact; a game folder comes back `pending` until
   * `folder()` sums it (or `approx`, already summed in this run).
   */
  list(): Promise<GameSizeInfo[]>
  /** Sums the game's folder (once per folder in this run) and returns its updated entry. */
  folder(gameId: number): Promise<GameSizeInfo | null>
}

/** "C:" from "c:\\games\\x"; null for a network path or anything else. */
export function driveOf(path: string): string | null {
  const match = /^([a-zA-Z]):/.exec(path.trim())
  return match ? `${match[1].toUpperCase()}:` : null
}

const realFileSize = (path: string): number | null => {
  try {
    const stats = statSync(path)
    return stats.isFile() ? stats.size : null
  } catch {
    return null
  }
}

/**
 * Settings › Armazenamento's sizes (D-34): read when the tab opens, kept in memory for the run,
 * never stored. Only reads the disk.
 */
export function createGameSizes(deps: GameSizesDeps): GameSizes {
  const fileSize = deps.fileSize ?? realFileSize
  const sumFolder = deps.sumFolder ?? ((path: string) => folderSize(path))
  // Per folder, so a folder two games share is summed once.
  const sums = new Map<string, Promise<FolderSize>>()

  /** The folder of a game started by an executable; null for ROMs, shortcuts and Steam. */
  const gameFolder = (game: Game): string | null => {
    if (game.origin === BuiltinOrigin.steam) return null
    const config = deps.configs.get(game.id)
    if (!config || config.romPath || !config.executablePath) return null
    if (!/\.exe$/i.test(config.executablePath.trim())) return null
    return dirname(config.executablePath.trim())
  }

  const sizeFromSum = (base: GameSizeInfo, sum: FolderSize): GameSizeInfo =>
    sum.status === 'ok'
      ? { ...base, bytes: sum.bytes, kind: 'approx', truncated: sum.truncated }
      : { ...base, bytes: null, kind: 'unknown' }

  const entries = async (): Promise<GameSizeInfo[]> => {
    const installed = deps.games.list().filter((game) => game.installed === true)
    const steam = await deps.steamSizes()
    const folders = new Map(installed.map((game) => [game.id, gameFolder(game)]))
    const owners = new Map<string, number>()
    for (const folder of folders.values()) {
      if (folder) owners.set(folderKey(folder), (owners.get(folderKey(folder)) ?? 0) + 1)
    }

    const result: GameSizeInfo[] = []
    for (const game of installed) {
      const base: GameSizeInfo = {
        gameId: game.id,
        title: game.title,
        drive: null,
        bytes: null,
        kind: 'unknown',
        truncated: false,
        shared: false
      }
      if (game.origin === BuiltinOrigin.steam) {
        const size = game.steamAppId === null ? undefined : steam.get(game.steamAppId)
        result.push(
          size ? { ...base, drive: driveOf(size.manifest), bytes: size.bytes, kind: 'exact' } : base
        )
        continue
      }
      const config = deps.configs.get(game.id)
      if (config?.romPath) {
        const bytes = fileSize(config.romPath)
        result.push({
          ...base,
          drive: driveOf(config.romPath),
          bytes,
          kind: bytes === null ? 'unknown' : 'exact'
        })
        continue
      }
      const folder = folders.get(game.id) ?? null
      if (!folder) {
        // A .url shortcut (D-07) has no folder: its size is unknown.
        result.push(base)
        continue
      }
      const entry: GameSizeInfo = {
        ...base,
        drive: driveOf(folder),
        shared: (owners.get(folderKey(folder)) ?? 0) > 1
      }
      if (!isSummableFolder(folder, deps.systemFolders)) {
        result.push(entry)
        continue
      }
      const summed = sums.get(folderKey(folder))
      result.push(summed ? sizeFromSum(entry, await summed) : { ...entry, kind: 'pending' })
    }
    return result
  }

  return {
    list: entries,

    async folder(gameId) {
      const game = deps.games.getById(gameId)
      const folder = game ? gameFolder(game) : null
      if (game && folder && isSummableFolder(folder, deps.systemFolders)) {
        const key = folderKey(folder)
        if (!sums.has(key)) sums.set(key, sumFolder(folder))
        await sums.get(key)
      }
      return (await entries()).find((entry) => entry.gameId === gameId) ?? null
    }
  }
}
