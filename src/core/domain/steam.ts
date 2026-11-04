/**
 * Steam rules that do not depend on I/O (ARCHITECTURE.md §3.12, D-12/D-17).
 * StateFlags are community-documented, not an official Valve contract; the
 * values below are pinned by fixtures.
 */
export const STEAM_STATE_FLAGS = {
  updateRequired: 2,
  fullyInstalled: 4,
  filesMissing: 32,
  filesCorrupt: 128,
  updateRunning: 256,
  updatePaused: 512,
  updateStarted: 1024,
  addingFiles: 262144,
  preallocating: 524288,
  downloading: 1048576,
  staging: 2097152,
  committing: 4194304
} as const

const BUSY =
  STEAM_STATE_FLAGS.updateRunning |
  STEAM_STATE_FLAGS.updateStarted |
  STEAM_STATE_FLAGS.addingFiles |
  STEAM_STATE_FLAGS.preallocating |
  STEAM_STATE_FLAGS.downloading |
  STEAM_STATE_FLAGS.staging |
  STEAM_STATE_FLAGS.committing

/** Transient state read live from the manifest; never stored (D-12). */
export type SteamLiveState = 'updating' | 'paused' | 'update-required' | 'unhealthy' | null

export function steamStateFromFlags(flags: number): {
  installed: boolean
  live: SteamLiveState
} {
  const has = (flag: number): boolean => (flags & flag) !== 0
  let live: SteamLiveState = null
  if (has(STEAM_STATE_FLAGS.updatePaused)) live = 'paused'
  else if ((flags & BUSY) !== 0) live = 'updating'
  else if (has(STEAM_STATE_FLAGS.filesMissing) || has(STEAM_STATE_FLAGS.filesCorrupt)) {
    live = 'unhealthy'
  } else if (has(STEAM_STATE_FLAGS.updateRequired)) live = 'update-required'
  return { installed: has(STEAM_STATE_FLAGS.fullyInstalled), live }
}

/** Manifests that are tools, not games (redistributables, runtimes). */
export const STEAM_NON_GAME_APP_IDS: ReadonlySet<number> = new Set([
  228980, // Steamworks Common Redistributables
  1070560, // Steam Linux Runtime
  1391110, // Steam Linux Runtime - Soldier
  1628350, // Steam Linux Runtime - Sniper
  1493710, // Proton Experimental
  1826330 // Proton EasyAntiCheat Runtime
])

export function isSteamAppId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** The only URL used to start a Steam game (D-17); built from a validated App ID. */
export function steamRunUrl(appId: number): string {
  if (!isSteamAppId(appId)) throw new Error('Invalid Steam App ID')
  return `steam://rungameid/${appId}`
}

/** True only for URLs `steamRunUrl` can produce. */
export function isSteamRunUrl(url: string): boolean {
  return /^steam:\/\/rungameid\/[1-9]\d{0,9}$/.test(url)
}

/** SteamID64: 17 digits (DATA_BASE_CONTEXT.md §3.3). */
export function isSteamId64(value: string): boolean {
  return /^\d{17}$/.test(value)
}
