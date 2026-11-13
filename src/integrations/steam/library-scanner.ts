import { join } from 'node:path'
import type { DiscoveredGame, DiscoveryResult } from '../../core/application'
import {
  STEAM_NON_GAME_APP_IDS,
  isSteamAppId,
  steamStateFromFlags,
  type SteamLiveState
} from '../../core/domain'
import { parseVdf, vdfGet, type VdfObject } from './vdf'

/** File access the scanner needs; injected so fixtures and failures are easy to test. */
export interface SteamFs {
  readText(path: string): Promise<string>
  listDir(path: string): Promise<string[]>
}

export interface SteamLibraryReport {
  path: string
  ok: boolean
}

export interface SteamScan {
  result: DiscoveryResult
  libraries: SteamLibraryReport[]
  /** Live (not stored) state per App ID, from the manifests just read. */
  live: Map<number, SteamLiveState>
  /** Manifest file per App ID, to re-read one game later. */
  manifests: Map<number, string>
}

const MANIFEST = /^appmanifest_(\d+)\.acf$/i

const text = (object: VdfObject, key: string): string | null => {
  const value = vdfGet(object, key)
  return typeof value === 'string' ? value : null
}

/**
 * Library folders listed in libraryfolders.vdf, plus the Steam folder itself.
 * The file's spelling wins (the registry stores the path in lower case).
 */
export function libraryPaths(steamPath: string, vdf: VdfObject): string[] {
  const root = vdfGet(vdf, 'libraryfolders')
  const paths: string[] = []
  if (root && typeof root === 'object') {
    for (const entry of Object.values(root)) {
      if (typeof entry === 'object') {
        const path = text(entry, 'path')
        if (path) paths.push(path)
      }
    }
  }
  paths.push(steamPath)
  const seen = new Set<string>()
  return paths.filter((path) => {
    const key = path
      .replace(/[\\/]+/g, '\\')
      .replace(/\\$/, '')
      .toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Reads libraryfolders.vdf and every appmanifest_*.acf (D-12). `complete`
 * only when the list and every library and manifest were read; one unreadable
 * library (e.g. a disconnected drive) makes the scan `partial`, so its games
 * become unknown instead of uninstalled. Tools such as the redistributables
 * are skipped.
 */
export async function scanSteamLibraries(steamPath: string, fs: SteamFs): Promise<SteamScan> {
  const live = new Map<number, SteamLiveState>()
  const manifests = new Map<number, string>()
  let vdf: VdfObject
  try {
    vdf = parseVdf(await fs.readText(join(steamPath, 'steamapps', 'libraryfolders.vdf')))
  } catch {
    return {
      result: { status: 'failed', reason: 'libraryfolders-unreadable' },
      libraries: [],
      live,
      manifests
    }
  }

  const libraries: SteamLibraryReport[] = []
  const found = new Map<number, DiscoveredGame>()
  let complete = true

  for (const path of libraryPaths(steamPath, vdf)) {
    const steamapps = join(path, 'steamapps')
    let names: string[]
    try {
      names = await fs.listDir(steamapps)
    } catch {
      libraries.push({ path, ok: false })
      complete = false
      continue
    }
    let ok = true
    for (const name of names) {
      if (!MANIFEST.test(name)) continue
      try {
        const file = join(steamapps, name)
        const { appId, title, state } = readManifest(await fs.readText(file))
        if (STEAM_NON_GAME_APP_IDS.has(appId)) continue
        // The same app in two libraries: the installed copy wins.
        if (found.get(appId)?.installed === true && !state.installed) continue
        found.set(appId, { externalId: String(appId), title, installed: state.installed })
        live.set(appId, state.live)
        manifests.set(appId, file)
      } catch {
        ok = false
        complete = false
      }
    }
    libraries.push({ path, ok })
  }

  const games = [...found.values()]
  return {
    result: complete
      ? { status: 'complete', games }
      : { status: 'partial', games, reason: 'library-unreadable' },
    libraries,
    live,
    manifests
  }
}

/** Parses one appmanifest_*.acf; throws when it is broken or incomplete. */
export function readManifest(textContent: string): {
  appId: number
  title: string
  state: ReturnType<typeof steamStateFromFlags>
} {
  const manifest = vdfGet(parseVdf(textContent), 'AppState')
  if (!manifest || typeof manifest !== 'object') throw new Error('No AppState')
  const appId = Number(text(manifest, 'appid'))
  const title = text(manifest, 'name')?.trim()
  if (!isSteamAppId(appId) || !title) throw new Error('Incomplete manifest')
  return { appId, title, state: steamStateFromFlags(Number(text(manifest, 'StateFlags') ?? 0)) }
}

/**
 * The bytes an installed game takes on disk, as Steam records it (`SizeOnDisk`, D-34); null when
 * the manifest has none or it is not a whole number.
 */
export function readManifestSize(textContent: string): number | null {
  const manifest = vdfGet(parseVdf(textContent), 'AppState')
  if (!manifest || typeof manifest !== 'object') return null
  const value = text(manifest, 'SizeOnDisk')
  if (value === null || !/^\d+$/.test(value)) return null
  const bytes = Number(value)
  return Number.isSafeInteger(bytes) ? bytes : null
}
