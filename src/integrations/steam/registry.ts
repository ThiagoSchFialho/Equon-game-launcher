import { execFile } from 'node:child_process'

const STEAM_KEY = 'HKCU\\Software\\Valve\\Steam'

/**
 * Reads one value under HKCU\Software\Valve\Steam with reg.exe: no shell,
 * fixed arguments. Resolves null when the key or value does not exist.
 */
export function readSteamRegistryValue(name: 'SteamPath' | 'RunningAppID'): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'reg.exe',
      ['query', STEAM_KEY, '/v', name],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => resolve(error ? null : parseRegQueryValue(stdout, name))
    )
  })
}

/** Extracts the data of `name` from `reg query` output (REG_SZ text or REG_DWORD as decimal). */
export function parseRegQueryValue(output: string, name: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(\S+)\s+(REG_SZ|REG_EXPAND_SZ|REG_DWORD)\s+(.*)$/.exec(line)
    if (!match || match[1].toLowerCase() !== name.toLowerCase()) continue
    const data = match[3].trim()
    if (match[2] === 'REG_DWORD') {
      const value = Number.parseInt(data, 16)
      return Number.isNaN(value) ? null : String(value)
    }
    return data
  }
  return null
}
