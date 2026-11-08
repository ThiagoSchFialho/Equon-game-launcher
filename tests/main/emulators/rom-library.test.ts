import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileInspector } from '../../../src/infrastructure/filesystem/file-inspector'
import {
  createEmulatorRepository,
  createGameRepository,
  createGenreRepository,
  createLaunchConfigRepository,
  createUnitOfWork,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import {
  createRomLibrary,
  type RomLibrary,
  type RomLibraryDeps
} from '../../../src/main/emulators/rom-library'
import type { IgdbGameFill } from '../../../src/shared/ipc/contract'
import { createTestDb } from '../../helpers/db'

const ROMS = 'D:\\Roms'
const FILL: IgdbGameFill = {
  name: 'The Legend of Zelda: Breath of the Wild',
  summary: 'An open world.',
  releaseDate: '2017-03-03',
  developer: 'Nintendo',
  genres: ['Aventura'],
  requiredAge: '10'
}

let db: SqliteDatabase
let dir: string
let files: string[]
let igdb: { [K in keyof RomLibraryDeps['igdb']]: ReturnType<typeof vi.fn> }
let library: RomLibrary
let changed: number
let progress: ({ done: number; total: number } | null)[]
let noMatch: [string, string[]][]

const games = (): ReturnType<ReturnType<typeof createGameRepository>['list']> =>
  createGameRepository(db).list()
const romOf = (id: number): string | null | undefined =>
  createLaunchConfigRepository(db).get(id)?.romPath

beforeEach(() => {
  db = createTestDb()
  dir = mkdtempSync(join(tmpdir(), 'equon-roms-'))
  mkdirSync(join(dir, 'roms'))
  files = []
  changed = 0
  progress = []
  noMatch = []
  igdb = {
    configured: vi.fn(() => false),
    search: vi.fn(async () => ({
      ok: true,
      data: [
        { id: 3, name: 'Breath of the Wild Guide' },
        { id: 7, name: 'The Legend of Zelda: Breath of the Wild' }
      ]
    })),
    fill: vi.fn(async () => ({ ok: true, data: FILL })),
    applyArtwork: vi.fn(async () => ({ ok: true, data: [] }))
  }
  library = createRomLibrary({
    games: createGameRepository(db),
    configs: createLaunchConfigRepository(db),
    emulators: createEmulatorRepository(db),
    genres: createGenreRepository(db),
    uow: createUnitOfWork(db),
    inspector: createFileInspector(),
    listFiles: async (directory) => {
      if (directory !== ROMS) throw new Error('unreadable')
      return files
    },
    join: (directory, name) => `${directory}\\${name}`,
    igdb: igdb as unknown as RomLibraryDeps['igdb'],
    onLibraryChanged: () => {
      changed += 1
    },
    onProgress: (value) => progress.push(value),
    onNoMatch: (title, results) => noMatch.push([title, results])
  })
  createEmulatorRepository(db).set('yuzu', 'C:\\Yuzu\\yuzu.exe')
  createEmulatorRepository(db).setRomDirectory('yuzu', ROMS)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ROM folder scan', () => {
  it('adds each whole game once, as an installed Yuzu game named after its file', async () => {
    files = [
      'The Legend of Zelda Breath of the Wild [01007EF00011E000][v0].nsp',
      'The Legend of Zelda Breath of the Wild [01007EF00011E800][v786432].nsp',
      'Super_Mario_Odyssey (USA).xci',
      'part.nca',
      'readme.txt'
    ]
    expect(await library.scan()).toEqual({ added: 2 })
    expect(games().map((g) => [g.title, g.origin, g.installed])).toEqual([
      ['Super Mario Odyssey', 'yuzu', true],
      ['The Legend of Zelda Breath of the Wild', 'yuzu', true]
    ])
    const zelda = games().find((g) => g.title.startsWith('The Legend'))!
    expect(romOf(zelda.id)).toBe(`${ROMS}\\${files[0]}`)
    expect(changed).toBe(1)

    // Again: nothing new, nothing written, IGDB not asked.
    expect(await library.scan()).toEqual({ added: 0 })
    expect(games()).toHaveLength(2)
    expect(igdb.search).not.toHaveBeenCalled()
  })

  it('skips a ROM a game already has, whatever the case of its path', async () => {
    files = ['Hades.nsp']
    await library.scan()
    files = ['HADES.NSP']
    db.prepare("UPDATE game_launch_configs SET rom_path = 'd:\\roms\\hades.nsp'").run()
    expect(await library.scan()).toEqual({ added: 0 })
  })

  it('adds nothing and changes nothing when the folder cannot be read', async () => {
    createEmulatorRepository(db).setRomDirectory('yuzu', 'E:\\Gone')
    expect(await library.scan()).toEqual({ added: 0 })
    expect(changed).toBe(0)
  })

  it('fills a game from IGDB only under the very same name, with its official name', async () => {
    igdb.configured.mockReturnValue(true)
    files = ['The Legend of Zelda Breath of the Wild [01007EF00011E000].nsp']
    await library.scan()
    expect(igdb.search).toHaveBeenCalledWith('The Legend of Zelda Breath of the Wild')
    expect(igdb.fill).toHaveBeenCalledWith(7)
    const [game] = games()
    expect(game).toMatchObject({
      title: 'The Legend of Zelda: Breath of the Wild',
      description: 'An open world.',
      developer: 'Nintendo',
      releaseDate: '2017-03-03',
      requiredAge: '10'
    })
    expect(
      createGenreRepository(db)
        .listForGame(game.id)
        .map((g) => g.name)
    ).toEqual(['Aventura'])
    expect(igdb.applyArtwork).toHaveBeenCalledWith(game.id, 7)
  })

  it('keeps the file name when no result has that name, or IGDB fails', async () => {
    igdb.configured.mockReturnValue(true)
    igdb.search.mockResolvedValueOnce({ ok: true, data: [{ id: 3, name: 'Hades II' }] })
    igdb.search.mockResolvedValueOnce({ ok: false, error: 'network' })
    files = ['Hades.nsp', 'Celeste.nsp']
    expect(await library.scan()).toEqual({ added: 2 })
    expect(games().map((g) => [g.title, g.description])).toEqual([
      ['Celeste', null],
      ['Hades', null]
    ])
    expect(igdb.fill).not.toHaveBeenCalled()
    expect(igdb.applyArtwork).not.toHaveBeenCalled()
    // Why, in the log: what IGDB had instead.
    expect(noMatch).toEqual([['Hades', ['Hades II']]])
  })

  it('tells the footer how far it got, and that it ended', async () => {
    igdb.configured.mockReturnValue(true)
    files = ['Hades.nsp', 'Celeste.nsp']
    await library.scan()
    expect(progress).toEqual([{ done: 0, total: 2 }, { done: 1, total: 2 }, null])
  })

  it('shows nothing in the footer without IGDB', async () => {
    files = ['Hades.nsp']
    await library.scan()
    expect(progress).toEqual([])
  })
})

describe('ROM folder setting', () => {
  it('takes an existing folder of a configured emulator, then scans it', async () => {
    const folder = join(dir, 'roms')
    expect(library.setDirectory('yuzu', folder)).toEqual({ ok: true, data: null })
    expect(createEmulatorRepository(db).get('yuzu')?.romDirectory).toBe(folder)
    expect(library.setDirectory('yuzu', null)).toEqual({ ok: true, data: null })
    expect(createEmulatorRepository(db).get('yuzu')?.romDirectory).toBeNull()
  })

  it('refuses a relative path, a missing folder, a file, and an emulator not configured', () => {
    expect(library.setDirectory('yuzu', 'roms')).toEqual({
      ok: false,
      error: { code: 'not-absolute', field: 'romDirectory' }
    })
    expect(library.setDirectory('yuzu', join(dir, 'nope'))).toEqual({
      ok: false,
      error: { code: 'missing', field: 'romDirectory' }
    })
    createEmulatorRepository(db).remove('yuzu')
    expect(library.setDirectory('yuzu', join(dir, 'roms'))).toEqual({
      ok: false,
      error: { code: 'not-found' }
    })
  })
})
