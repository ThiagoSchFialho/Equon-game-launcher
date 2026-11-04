import { describe, expect, it } from 'vitest'
import { steamStateFromFlags, steamRunUrl, isSteamRunUrl, isSteamId64 } from '../../src/core/domain'
import { scanSteamLibraries, type SteamFs } from '../../src/integrations/steam/library-scanner'
import { parseRegQueryValue } from '../../src/integrations/steam/registry'
import { createSteamAdapter, DEFAULT_STEAM_PATH } from '../../src/integrations/steam/steam-adapter'
import { parseVdf, VdfParseError } from '../../src/integrations/steam/vdf'

// Shapes taken from a real install (values shortened).
const LIBRARY_FOLDERS = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"
\t\t"label"\t\t""
\t\t"apps"
\t\t{
\t\t\t"228980"\t\t"611603385"
\t\t}
\t}
\t"1"
\t{
\t\t"path"\t\t"D:\\\\SteamLibrary"
\t\t"apps"
\t\t{
\t\t\t"2379780"\t\t"1"
\t\t\t"578080"\t\t"2"
\t\t}
\t}
\t"2"
\t{
\t\t"path"\t\t"E:\\\\SteamLibrary"
\t}
}
`

const manifest = (appId: number, name: string, flags: number): string => `"AppState"
{
\t"appid"\t\t"${appId}"
\t"universe"\t\t"1"
\t"name"\t\t"${name}"
\t"StateFlags"\t\t"${flags}"
\t"installdir"\t\t"${name}"
\t"UserConfig"
\t{
\t\t"language"\t\t"english"
\t}
}
`

/** In-memory Steam folders; missing directories throw like a disconnected drive. */
function fakeFs(files: Record<string, string>): SteamFs {
  const norm = (path: string): string => path.replace(/\//g, '\\').toLowerCase()
  const entries = new Map(Object.entries(files).map(([k, v]) => [norm(k), v]))
  return {
    readText: async (path) => {
      const text = entries.get(norm(path))
      if (text === undefined) throw new Error(`ENOENT ${path}`)
      return text
    },
    listDir: async (path) => {
      const prefix = norm(path) + '\\'
      const names = [...entries.keys()]
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('\\'))
        .map((k) => k.slice(prefix.length))
      if (names.length === 0) throw new Error(`ENOENT ${path}`)
      return names
    }
  }
}

const C = 'C:\\Program Files (x86)\\Steam'
const install = (extra: Record<string, string> = {}): Record<string, string> => ({
  [`${C}\\steamapps\\libraryfolders.vdf`]: LIBRARY_FOLDERS,
  [`${C}\\steamapps\\appmanifest_228980.acf`]: manifest(
    228980,
    'Steamworks Common Redistributables',
    4
  ),
  'D:\\SteamLibrary\\steamapps\\appmanifest_2379780.acf': manifest(2379780, 'Balatro', 4),
  'D:\\SteamLibrary\\steamapps\\appmanifest_578080.acf': manifest(578080, 'PUBG: BATTLEGROUNDS', 6),
  'E:\\SteamLibrary\\steamapps\\appmanifest_730.acf': manifest(730, 'Counter-Strike 2', 1026),
  ...extra
})

describe('parseVdf', () => {
  it('parses nested blocks, escapes and comments', () => {
    expect(parseVdf('// c\n"a" { "b" "x\\"y\\\\z" "n" { } } "k" "v"\n')).toEqual({
      a: { b: 'x"y\\z', n: {} },
      k: 'v'
    })
  })

  it('rejects broken files', () => {
    expect(() => parseVdf('"a" { "b" "c"')).toThrow(VdfParseError)
    expect(() => parseVdf('"a" "unterminated')).toThrow(VdfParseError)
    expect(() => parseVdf('}')).toThrow(VdfParseError)
  })
})

describe('steamStateFromFlags', () => {
  it.each([
    [4, true, null],
    [6, true, 'update-required'],
    [1026, false, 'updating'],
    [1030, true, 'updating'],
    [516, true, 'paused'],
    [36, true, 'unhealthy'],
    [0, false, null]
  ])('flags %i → installed %s, live %s', (flags, installed, live) => {
    expect(steamStateFromFlags(flags)).toEqual({ installed, live })
  })
})

describe('scanSteamLibraries', () => {
  it('reads every library, skips tools and reports live states', async () => {
    const scan = await scanSteamLibraries(C, fakeFs(install()))
    expect(scan.result).toEqual({
      status: 'complete',
      games: [
        { externalId: '2379780', title: 'Balatro', installed: true },
        { externalId: '578080', title: 'PUBG: BATTLEGROUNDS', installed: true },
        { externalId: '730', title: 'Counter-Strike 2', installed: false }
      ]
    })
    expect(scan.libraries.map((l) => l.ok)).toEqual([true, true, true])
    expect(scan.live.get(578080)).toBe('update-required')
    expect(scan.live.get(730)).toBe('updating')
  })

  it('is partial when a library drive is missing, keeping what it read', async () => {
    const files = install()
    delete files['E:\\SteamLibrary\\steamapps\\appmanifest_730.acf']
    const scan = await scanSteamLibraries(C, fakeFs(files))
    expect(scan.result.status).toBe('partial')
    expect(scan.libraries).toEqual([
      { path: C, ok: true },
      { path: 'D:\\SteamLibrary', ok: true },
      { path: 'E:\\SteamLibrary', ok: false }
    ])
    expect(scan.result.status === 'partial' && scan.result.games).toHaveLength(2)
  })

  it('is partial when a manifest is corrupt, and failed without the library list', async () => {
    const corrupt = await scanSteamLibraries(
      C,
      fakeFs(install({ 'D:\\SteamLibrary\\steamapps\\appmanifest_1.acf': '"AppState" {' }))
    )
    expect(corrupt.result.status).toBe('partial')

    const files = install()
    delete files[`${C}\\steamapps\\libraryfolders.vdf`]
    expect((await scanSteamLibraries(C, fakeFs(files))).result).toEqual({
      status: 'failed',
      reason: 'libraryfolders-unreadable'
    })
  })
})

describe('createSteamAdapter', () => {
  const adapter = (
    steamPath: string | null,
    present: string[]
  ): ReturnType<typeof createSteamAdapter> =>
    createSteamAdapter({
      fs: fakeFs(install()),
      readSteamPath: async () => steamPath,
      isFile: (path) => present.includes(path.toLowerCase())
    })
  const vdfAt = (dir: string): string => `${dir}\\steamapps\\libraryfolders.vdf`.toLowerCase()

  it('uses the registry path (forward slashes, lower case)', async () => {
    const steam = adapter('c:/program files (x86)/steam', [vdfAt(C)])
    expect((await steam.discover()).status).toBe('complete')
    expect(steam.steamPath()?.toLowerCase()).toBe(C.toLowerCase())
    expect(steam.liveState(730)).toBe('updating')
  })

  it('falls back to the default folder, and fails without changing anything when absent', async () => {
    expect((await adapter(null, [vdfAt(DEFAULT_STEAM_PATH)]).discover()).status).toBe('complete')
    const missing = adapter('d:/nowhere', [])
    expect(await missing.discover()).toEqual({ status: 'failed', reason: 'steam-not-found' })
    expect(missing.steamPath()).toBeNull()
  })
})

describe('registry and URLs', () => {
  it('parses reg query output', () => {
    const out =
      '\r\nHKEY_CURRENT_USER\\Software\\Valve\\Steam\r\n    RunningAppID    REG_DWORD    0x245004\r\n\r\n'
    expect(parseRegQueryValue(out, 'RunningAppID')).toBe('2379780')
    expect(
      parseRegQueryValue('    SteamPath    REG_SZ    c:/program files (x86)/steam', 'SteamPath')
    ).toBe('c:/program files (x86)/steam')
    expect(parseRegQueryValue('ERROR: not found', 'SteamPath')).toBeNull()
  })

  it('builds and recognizes only steam://rungameid/<appid>', () => {
    expect(steamRunUrl(730)).toBe('steam://rungameid/730')
    expect(() => steamRunUrl(0)).toThrow()
    expect(() => steamRunUrl(1.5)).toThrow()
    expect(isSteamRunUrl('steam://rungameid/730')).toBe(true)
    expect(isSteamRunUrl('steam://rungameid/730;calc')).toBe(false)
    expect(isSteamRunUrl('steam://install/730')).toBe(false)
  })

  it('validates SteamID64', () => {
    expect(isSteamId64('76561197960287930')).toBe(true)
    expect(isSteamId64('7656119796028793')).toBe(false)
    expect(isSteamId64('7656119796028793a')).toBe(false)
  })
})
