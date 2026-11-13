import { describe, expect, it, vi } from 'vitest'
import {
  createGameRepository,
  createLaunchConfigRepository
} from '../../../src/infrastructure/persistence'
import type { FolderSize } from '../../../src/infrastructure/filesystem/folder-size'
import { readManifestSize } from '../../../src/integrations/steam/library-scanner'
import { createGameSizes, driveOf, type GameSizes } from '../../../src/main/system/game-sizes'
import type { GameSizeInfo } from '../../../src/shared/ipc/contract'
import { createTestDb } from '../../helpers/db'

const setup = (
  sumFolder = vi.fn(async (): Promise<FolderSize> => ({
    status: 'ok',
    bytes: 1000,
    truncated: false
  }))
): {
  games: ReturnType<typeof createGameRepository>
  add: (title: string, origin: string, launch: { exe?: string; rom?: string }) => number
  sizes: GameSizes
  steamId: number
  sumFolder: typeof sumFolder
} => {
  const db = createTestDb()
  const games = createGameRepository(db)
  const configs = createLaunchConfigRepository(db)
  const add = (title: string, origin: string, launch: { exe?: string; rom?: string }): number => {
    const game = games.create({ origin, title, installed: true })
    configs.save({
      gameId: game.id,
      executablePath: launch.exe ?? null,
      romPath: launch.rom ?? null,
      arguments: [],
      workingDirectory: null
    })
    return game.id
  }
  const steam = games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
  games.setInstalled(steam.id, true)
  const sizes = createGameSizes({
    games,
    configs,
    steamSizes: async () =>
      new Map([
        [620, { bytes: 12_000, manifest: 'D:\\SteamLibrary\\steamapps\\appmanifest_620.acf' }]
      ]),
    systemFolders: ['C:\\Program Files'],
    fileSize: (path) => (path.endsWith('.nsp') ? 5000 : null),
    sumFolder
  })
  return { games, add, sizes, steamId: steam.id, sumFolder }
}

describe('Settings › Armazenamento game sizes (D-34)', () => {
  it('Steam and ROM sizes are exact and at once; folders wait to be summed', async () => {
    const { add, sizes, steamId } = setup()
    // A ROM game stores only its ROM; the emulator comes from Settings.
    const rom = add('Zelda', 'yuzu', { rom: 'E:\\Roms\\zelda.nsp' })
    const manual = add('Indie', 'manual', { exe: 'D:\\Games\\Indie\\indie.exe' })
    const shortcut = add('Epic', 'manual', { exe: 'C:\\Users\\me\\Desktop\\Epic.url' })
    const list = await sizes.list()
    const of = (id: number): GameSizeInfo | undefined => list.find((entry) => entry.gameId === id)
    expect(of(steamId)).toMatchObject({ drive: 'D:', bytes: 12_000, kind: 'exact' })
    expect(of(rom)).toMatchObject({ drive: 'E:', bytes: 5000, kind: 'exact' })
    expect(of(manual)).toMatchObject({ drive: 'D:', bytes: null, kind: 'pending' })
    expect(of(shortcut)).toMatchObject({ drive: null, kind: 'unknown' })
  })

  it('sums a folder once, even for two games in it, and keeps it for the run', async () => {
    const { add, sizes, sumFolder } = setup()
    const a = add('A', 'manual', { exe: 'D:\\Games\\Pack\\a.exe' })
    const b = add('B', 'manual', { exe: 'd:\\games\\pack\\b.exe' })
    expect(await sizes.folder(a)).toMatchObject({ kind: 'approx', bytes: 1000, shared: true })
    expect(await sizes.folder(b)).toMatchObject({ kind: 'approx', bytes: 1000, shared: true })
    expect(sumFolder).toHaveBeenCalledOnce()
    // Opening the tab again: already summed.
    const list = await sizes.list()
    expect(list.find((entry) => entry.gameId === a)).toMatchObject({ kind: 'approx' })
  })

  it('never sums a drive root or a system folder', async () => {
    const { add, sizes, sumFolder } = setup()
    const root = add('Root', 'manual', { exe: 'D:\\game.exe' })
    const system = add('Sys', 'manual', { exe: 'C:\\Program Files\\loose.exe' })
    expect(await sizes.folder(root)).toMatchObject({ kind: 'unknown', drive: 'D:' })
    expect(await sizes.folder(system)).toMatchObject({ kind: 'unknown', drive: 'C:' })
    expect(sumFolder).not.toHaveBeenCalled()
  })

  it('reports a folder that cannot be read as unknown', async () => {
    const { add, sizes } = setup(vi.fn(async (): Promise<FolderSize> => ({ status: 'unreadable' })))
    const id = add('Locked', 'manual', { exe: 'D:\\Games\\Locked\\x.exe' })
    expect(await sizes.folder(id)).toMatchObject({ kind: 'unknown', bytes: null })
  })

  it('leaves out games that are not installed', async () => {
    const { games, sizes } = setup()
    games.create({ origin: 'manual', title: 'Gone', installed: false })
    expect((await sizes.list()).map((entry) => entry.title)).not.toContain('Gone')
  })
})

describe('driveOf and readManifestSize', () => {
  it('reads the drive letter of a local path', () => {
    expect(driveOf('d:\\SteamLibrary\\x')).toBe('D:')
    expect(driveOf('\\\\server\\share\\x')).toBeNull()
  })

  it('reads SizeOnDisk, and nothing from a broken or odd value', () => {
    const manifest = (size: string): string =>
      `"AppState"\n{\n  "appid" "620"\n  "name" "Portal 2"\n  "SizeOnDisk" "${size}"\n}`
    expect(readManifestSize(manifest('12884901888'))).toBe(12884901888)
    expect(readManifestSize(manifest('-1'))).toBeNull()
    expect(readManifestSize('"AppState"\n{\n  "appid" "620"\n}')).toBeNull()
  })
})
