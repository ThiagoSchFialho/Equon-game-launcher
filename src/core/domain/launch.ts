/**
 * How a non-Steam game is started (GAME_LAUNCH_CONFIGS, D-07). Exactly one
 * of executablePath (an .exe or .url) and romPath (emulator games) is set.
 * Paths are untrusted.
 */
export interface LaunchConfig {
  gameId: number
  executablePath: string | null
  romPath: string | null
  arguments: string[]
  /** null = the executable's folder. */
  workingDirectory: string | null
}

/** Native executables only: .bat/.cmd would need a shell (ARCHITECTURE.md §7). */
export function isAllowedExecutableName(path: string): boolean {
  return /\.exe$/i.test(path.trim())
}

/** Windows internet shortcut (.url), opened through an allowlisted URL. */
export function isShortcutName(path: string): boolean {
  return /\.url$/i.test(path.trim())
}

/** Store protocols a .url shortcut may open (DATA_BASE_CONTEXT.md §3.7). */
export const ALLOWED_SHORTCUT_SCHEMES = [
  'com.epicgames.launcher:',
  'steam:',
  'uplay:',
  'origin2:',
  'link2ea:',
  'battlenet:'
] as const

export function isAllowedShortcutUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return (ALLOWED_SHORTCUT_SCHEMES as readonly string[]).includes(parsed.protocol.toLowerCase())
}

/**
 * Extracts the target of a Windows internet shortcut: the `URL=` line of the
 * `[InternetShortcut]` section. Returns null when there is none.
 */
export function parseInternetShortcut(text: string): string | null {
  let inSection = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inSection = line.toLowerCase() === '[internetshortcut]'
      continue
    }
    if (inSection && /^url=/i.test(line)) {
      const url = line.slice(4).trim()
      return url === '' ? null : url
    }
  }
  return null
}
