import { join, normalize } from 'node:path'
import type { DiscoveryResult, IntegrationAdapter } from '../../core/application'
import type { SteamLiveState } from '../../core/domain'
import { scanSteamLibraries, type SteamFs, type SteamLibraryReport } from './library-scanner'

export const DEFAULT_STEAM_PATH = 'C:\\Program Files (x86)\\Steam'

export interface SteamAdapterDeps {
  fs: SteamFs
  /** HKCU\Software\Valve\Steam\SteamPath, or null. */
  readSteamPath(): Promise<string | null>
  isFile(path: string): boolean
}

export interface SteamAdapter extends IntegrationAdapter {
  /** Steam folder found by the last scan; null when Steam was not found. */
  steamPath(): string | null
  libraries(): SteamLibraryReport[]
  /** Live manifest state from the last scan (updating, paused…); never stored. */
  liveState(appId: number): SteamLiveState
}

/**
 * The only automatic adapter (D-05, D-12). Steam is located through the
 * registry `SteamPath`, falling back to the default folder; there is no
 * manual override because libraryfolders.vdf already lists every library.
 */
export function createSteamAdapter(deps: SteamAdapterDeps): SteamAdapter {
  let found: string | null = null
  let libraries: SteamLibraryReport[] = []
  let live = new Map<number, SteamLiveState>()

  const hasLibraryList = (path: string): boolean =>
    deps.isFile(join(path, 'steamapps', 'libraryfolders.vdf'))

  const locate = async (): Promise<string | null> => {
    const fromRegistry = await deps.readSteamPath()
    // The registry stores e.g. "c:/program files (x86)/steam".
    const candidates = [fromRegistry ? normalize(fromRegistry) : null, DEFAULT_STEAM_PATH]
    return candidates.find((path) => path !== null && hasLibraryList(path)) ?? null
  }

  return {
    source: 'steam',
    capabilities: {
      installState: true,
      launch: true,
      playtime: true,
      achievements: true,
      metadata: true
    },

    async discover(): Promise<DiscoveryResult> {
      found = await locate()
      if (found === null) {
        libraries = []
        return { status: 'failed', reason: 'steam-not-found' }
      }
      const scan = await scanSteamLibraries(found, deps.fs)
      libraries = scan.libraries
      const same = (a: string): boolean => a.toLowerCase() === (found as string).toLowerCase()
      found = libraries.find((library) => same(library.path))?.path ?? found
      if (scan.result.status !== 'failed') live = scan.live
      return scan.result
    },

    steamPath: () => found,
    libraries: () => libraries,
    liveState: (appId) => live.get(appId) ?? null
  }
}
