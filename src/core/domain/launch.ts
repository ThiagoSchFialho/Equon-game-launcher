/** How a non-Steam game is started (GAME_LAUNCH_CONFIGS, D-07). Paths are untrusted. */
export interface LaunchConfig {
  gameId: number
  executablePath: string
  arguments: string[]
  /** null = the executable's folder. */
  workingDirectory: string | null
}

export const ROM_PLACEHOLDER = '{rom}'

/**
 * Fills an origin's default arguments with the chosen ROM path: every
 * `{rom}` is replaced; without a placeholder the ROM is appended.
 */
export function applyRomToArguments(template: readonly string[], romPath: string): string[] {
  if (!template.some((arg) => arg.includes(ROM_PLACEHOLDER))) return [...template, romPath]
  return template.map((arg) => arg.split(ROM_PLACEHOLDER).join(romPath))
}

/** Only native executables: .bat/.cmd would need a shell (ARCHITECTURE.md §7). */
export function isAllowedExecutableName(path: string): boolean {
  return /\.exe$/i.test(path.trim())
}
