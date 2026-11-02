/** How a non-Steam game is started (GAME_LAUNCH_CONFIGS, D-07). Paths are untrusted. */
export interface LaunchConfig {
  gameId: number
  executablePath: string
  arguments: string[]
  /** null = the executable's folder. */
  workingDirectory: string | null
}

/** Only native executables: .bat/.cmd would need a shell (ARCHITECTURE.md §7). */
export function isAllowedExecutableName(path: string): boolean {
  return /\.exe$/i.test(path.trim())
}
