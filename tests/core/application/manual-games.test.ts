import { beforeEach, describe, expect, it } from 'vitest'
import {
  ManualGameValidationError,
  isAbsoluteWindowsPath,
  refreshManualInstallStates,
  saveManualGame,
  validateManualGame,
  type FileState,
  type ManualGameChecks,
  type ManualGameInput
} from '../../../src/core/application'
import {
  createGameRepository,
  createLaunchConfigRepository,
  createUnitOfWork,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import { createTestDb } from '../../helpers/db'

const files = new Map<string, FileState>()
const shortcuts = new Map<string, string | null>()
const checks: ManualGameChecks = {
  inspector: { stateOf: (path) => files.get(path) ?? 'missing' },
  originExists: (key) => ['manual', 'ps2', 'steam', 'yuzu'].includes(key),
  readShortcut: (path) => shortcuts.get(path) ?? null
}

const EXE = 'C:\\Games\\HQ\\hq.exe'

const input = (overrides: Partial<ManualGameInput> = {}): ManualGameInput => ({
  origin: 'manual',
  title: '  Hollow   Quest ',
  description: '  ',
  developer: ' Studio ',
  releaseDate: '2020-05-01',
  requiredAge: '12',
  playtimeOffset: 120,
  launch: { executablePath: EXE, romPath: null, arguments: ['-w'], workingDirectory: null },
  ...overrides
})

const launch = (extra: Partial<ManualGameInput['launch']>): Partial<ManualGameInput> => ({
  launch: { executablePath: EXE, romPath: null, arguments: [], workingDirectory: null, ...extra }
})

const codeOf = (value: ManualGameInput): string => {
  try {
    validateManualGame(value, checks)
  } catch (error) {
    if (error instanceof ManualGameValidationError) return `${error.field}:${error.code}`
    throw error
  }
  return 'ok'
}

beforeEach(() => {
  files.clear()
  shortcuts.clear()
  files.set(EXE, 'file')
  files.set('C:\\Games\\HQ', 'directory')
})

describe('validateManualGame: fields', () => {
  it('normalizes text fields', () => {
    expect(validateManualGame(input(), checks)).toMatchObject({
      title: 'Hollow Quest',
      description: null,
      developer: 'Studio'
    })
  })

  it.each([
    [{ title: '   ' }, 'title:required'],
    [{ origin: 'steam' }, 'origin:invalid'],
    [{ origin: 'unknown' }, 'origin:invalid'],
    [{ releaseDate: '2020-02-30' }, 'releaseDate:invalid'],
    [{ releaseDate: '01-05-2020' }, 'releaseDate:invalid'],
    [{ requiredAge: '17' }, 'requiredAge:invalid'],
    [{ playtimeOffset: -1 }, 'playtimeOffset:invalid'],
    [{ playtimeOffset: 1.5 }, 'playtimeOffset:invalid']
  ] as [Partial<ManualGameInput>, string][])('rejects %o with %s', (overrides, code) => {
    expect(codeOf(input(overrides))).toBe(code)
  })
})

describe('validateManualGame: executables', () => {
  it.each([
    [null, 'executablePath:required'],
    ['relative\\game.exe', 'executablePath:not-absolute'],
    ['C:\\Games\\HQ\\run.bat', 'executablePath:not-exe'],
    ['C:\\Games\\HQ\\gone.exe', 'executablePath:missing']
  ])('rejects executable %s', (executablePath, code) => {
    expect(codeOf(input(launch({ executablePath })))).toBe(code)
  })

  it('distinguishes a folder named .exe and an unreadable path', () => {
    files.set('D:\\odd.exe', 'directory')
    files.set('E:\\offline.exe', 'unreadable')
    expect(codeOf(input(launch({ executablePath: 'D:\\odd.exe' })))).toBe('executablePath:not-file')
    expect(codeOf(input(launch({ executablePath: 'E:\\offline.exe' })))).toBe(
      'executablePath:unreadable'
    )
  })

  it('validates arguments and the working directory', () => {
    expect(codeOf(input(launch({ arguments: ['a\0b'] })))).toBe('arguments:invalid')
    expect(codeOf(input(launch({ workingDirectory: 'C:\\Nope' })))).toBe('workingDirectory:missing')
    expect(
      validateManualGame(input(launch({ workingDirectory: 'C:\\Games\\HQ' })), checks).launch
        .workingDirectory
    ).toBe('C:\\Games\\HQ')
  })
})

describe('validateManualGame: .url shortcuts', () => {
  const URL_FILE = 'C:\\Games\\Fortnite.url'

  it('accepts a shortcut to an allowlisted store URL and drops arguments and folder', () => {
    files.set(URL_FILE, 'file')
    shortcuts.set(URL_FILE, 'com.epicgames.launcher://apps/Fortnite?action=launch')
    expect(
      validateManualGame(
        input(
          launch({ executablePath: URL_FILE, arguments: ['-x'], workingDirectory: 'C:\\Games\\HQ' })
        ),
        checks
      ).launch
    ).toEqual({ executablePath: URL_FILE, romPath: null, arguments: [], workingDirectory: null })
  })

  it('rejects unreadable shortcuts and URLs outside the allowlist', () => {
    files.set(URL_FILE, 'file')
    expect(codeOf(input(launch({ executablePath: URL_FILE })))).toBe(
      'executablePath:shortcut-invalid'
    )
    for (const url of [
      'https://example.com',
      'file:///C:/Windows/system32/cmd.exe',
      'javascript:alert(1)'
    ]) {
      shortcuts.set(URL_FILE, url)
      expect(codeOf(input(launch({ executablePath: URL_FILE }))), url).toBe(
        'executablePath:shortcut-scheme'
      )
    }
  })
})

describe('validateManualGame: Yuzu ROMs', () => {
  const ROM = 'D:\\Switch\\Zelda.nsp'
  const yuzu = (romPath: string | null): ManualGameInput =>
    input({
      origin: 'yuzu',
      launch: { executablePath: EXE, romPath, arguments: ['-x'], workingDirectory: null }
    })

  it('keeps only the ROM for emulator games', () => {
    files.set(ROM, 'file')
    expect(validateManualGame(yuzu(ROM), checks).launch).toEqual({
      executablePath: null,
      romPath: ROM,
      arguments: [],
      workingDirectory: null
    })
  })

  it.each([
    [null, 'romPath:required'],
    ['Zelda.nsp', 'romPath:not-absolute'],
    ['D:\\Switch\\Zelda.iso', 'romPath:not-rom'],
    ['D:\\Switch\\Gone.xci', 'romPath:missing']
  ])('rejects ROM %s', (romPath, code) => {
    expect(codeOf(yuzu(romPath))).toBe(code)
  })
})

describe('isAbsoluteWindowsPath', () => {
  it('accepts drive and UNC paths only', () => {
    expect(isAbsoluteWindowsPath('C:\\x.exe')).toBe(true)
    expect(isAbsoluteWindowsPath('d:/x.exe')).toBe(true)
    expect(isAbsoluteWindowsPath('\\\\server\\share\\x.exe')).toBe(true)
    expect(isAbsoluteWindowsPath('x.exe')).toBe(false)
    expect(isAbsoluteWindowsPath('\\x.exe')).toBe(false)
  })
})

describe('saveManualGame and install states', () => {
  let db: SqliteDatabase
  beforeEach(() => {
    db = createTestDb()
  })
  const deps = (): Parameters<typeof saveManualGame>[0] => ({
    games: createGameRepository(db),
    configs: createLaunchConfigRepository(db),
    uow: createUnitOfWork(db)
  })

  it('creates a game with its launch config, installed, with the offset as playtime', () => {
    const game = saveManualGame(deps(), validateManualGame(input(), checks))
    expect(game).toMatchObject({ title: 'Hollow Quest', installed: true, playtime: 120 })
    expect(createLaunchConfigRepository(db).get(game.id)).toMatchObject({
      executablePath: EXE,
      romPath: null,
      arguments: ['-w']
    })
  })

  it('updates an existing game and its config, including switching to a ROM', () => {
    const created = saveManualGame(deps(), validateManualGame(input(), checks))
    files.set('D:\\Switch\\Zelda.nsp', 'file')
    const updated = saveManualGame(
      deps(),
      validateManualGame(
        input({
          title: 'Renamed',
          origin: 'yuzu',
          playtimeOffset: 5,
          launch: {
            executablePath: null,
            romPath: 'D:\\Switch\\Zelda.nsp',
            arguments: [],
            workingDirectory: null
          }
        }),
        checks
      ),
      created.id
    )
    expect(updated).toMatchObject({ id: created.id, title: 'Renamed', playtime: 5 })
    expect(createLaunchConfigRepository(db).get(created.id)).toMatchObject({
      executablePath: null,
      romPath: 'D:\\Switch\\Zelda.nsp'
    })
  })

  it('refreshes install states from the executable or ROM, never writing 0 on unreadable paths', () => {
    const d = deps()
    const a = saveManualGame(d, validateManualGame(input(), checks))
    files.set(EXE, 'unreadable')
    expect(refreshManualInstallStates(d, checks.inspector)).toBe(1)
    expect(d.games.getById(a.id)?.installed).toBeNull()
    files.delete(EXE)
    refreshManualInstallStates(d, checks.inspector)
    expect(d.games.getById(a.id)?.installed).toBe(false)
    files.set(EXE, 'file')
    refreshManualInstallStates(d, checks.inspector)
    expect(d.games.getById(a.id)?.installed).toBe(true)
    expect(refreshManualInstallStates(d, checks.inspector)).toBe(0)

    files.set('D:\\Switch\\Zelda.nsp', 'file')
    const rom = saveManualGame(
      d,
      validateManualGame(
        input({
          origin: 'yuzu',
          launch: {
            executablePath: null,
            romPath: 'D:\\Switch\\Zelda.nsp',
            arguments: [],
            workingDirectory: null
          }
        }),
        checks
      )
    )
    files.delete('D:\\Switch\\Zelda.nsp')
    refreshManualInstallStates(d, checks.inspector)
    expect(d.games.getById(rom.id)?.installed).toBe(false)
  })
})
