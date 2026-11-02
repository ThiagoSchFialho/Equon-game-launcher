import { beforeEach, describe, expect, it } from 'vitest'
import {
  ManualGameValidationError,
  isAbsoluteWindowsPath,
  refreshManualInstallStates,
  saveManualGame,
  validateManualGame,
  type FileInspector,
  type FileState,
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
const inspector: FileInspector = { stateOf: (path) => files.get(path) ?? 'missing' }
const originExists = (key: string): boolean => ['manual', 'ps2', 'steam'].includes(key)

const input = (overrides: Partial<ManualGameInput> = {}): ManualGameInput => ({
  origin: 'manual',
  title: '  Hollow   Quest ',
  description: '  ',
  developer: ' Studio ',
  releaseDate: '2020-05-01',
  requiredAge: '12',
  playtimeOffset: 120,
  launch: { executablePath: 'C:\\Games\\HQ\\hq.exe', arguments: ['-w'], workingDirectory: null },
  ...overrides
})

const codeOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    if (error instanceof ManualGameValidationError) return `${error.field}:${error.code}`
    throw error
  }
  return 'ok'
}

beforeEach(() => {
  files.clear()
  files.set('C:\\Games\\HQ\\hq.exe', 'file')
  files.set('C:\\Games\\HQ', 'directory')
})

describe('validateManualGame', () => {
  it('normalizes text fields', () => {
    expect(validateManualGame(input(), inspector, originExists)).toMatchObject({
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
    expect(codeOf(() => validateManualGame(input(overrides), inspector, originExists))).toBe(code)
  })

  it.each([
    ['relative\\game.exe', 'executablePath:not-absolute'],
    ['C:\\Games\\HQ\\run.bat', 'executablePath:not-exe'],
    ['C:\\Games\\HQ\\gone.exe', 'executablePath:missing']
  ])('rejects executable %s', (executablePath, code) => {
    const launch = { executablePath, arguments: [], workingDirectory: null }
    expect(codeOf(() => validateManualGame(input({ launch }), inspector, originExists))).toBe(code)
  })

  it('distinguishes a folder named .exe and an unreadable path', () => {
    files.set('D:\\odd.exe', 'directory')
    files.set('E:\\offline.exe', 'unreadable')
    const at = (executablePath: string): ManualGameInput =>
      input({ launch: { executablePath, arguments: [], workingDirectory: null } })
    expect(codeOf(() => validateManualGame(at('D:\\odd.exe'), inspector, originExists))).toBe(
      'executablePath:not-file'
    )
    expect(codeOf(() => validateManualGame(at('E:\\offline.exe'), inspector, originExists))).toBe(
      'executablePath:unreadable'
    )
  })

  it('validates arguments and the working directory', () => {
    const launch = (extra: Partial<ManualGameInput['launch']>): Partial<ManualGameInput> => ({
      launch: {
        executablePath: 'C:\\Games\\HQ\\hq.exe',
        arguments: [],
        workingDirectory: null,
        ...extra
      }
    })
    expect(
      codeOf(() =>
        validateManualGame(input(launch({ arguments: ['a\0b'] })), inspector, originExists)
      )
    ).toBe('arguments:invalid')
    expect(
      codeOf(() =>
        validateManualGame(input(launch({ workingDirectory: 'C:\\Nope' })), inspector, originExists)
      )
    ).toBe('workingDirectory:missing')
    expect(
      validateManualGame(
        input(launch({ workingDirectory: 'C:\\Games\\HQ' })),
        inspector,
        originExists
      ).launch.workingDirectory
    ).toBe('C:\\Games\\HQ')
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
    const game = saveManualGame(deps(), validateManualGame(input(), inspector, originExists))
    expect(game).toMatchObject({ title: 'Hollow Quest', installed: true, playtime: 120 })
    expect(createLaunchConfigRepository(db).get(game.id)).toMatchObject({
      executablePath: 'C:\\Games\\HQ\\hq.exe',
      arguments: ['-w']
    })
  })

  it('updates an existing game and its config', () => {
    const created = saveManualGame(deps(), validateManualGame(input(), inspector, originExists))
    const updated = saveManualGame(
      deps(),
      validateManualGame(input({ title: 'Renamed', playtimeOffset: 5 }), inspector, originExists),
      created.id
    )
    expect(updated).toMatchObject({ id: created.id, title: 'Renamed', playtime: 5 })
  })

  it('refreshes install states without writing 0 on unreadable paths', () => {
    const d = deps()
    const a = saveManualGame(d, validateManualGame(input(), inspector, originExists))
    files.set('C:\\Games\\HQ\\hq.exe', 'unreadable')
    expect(refreshManualInstallStates(d, inspector)).toBe(1)
    expect(d.games.getById(a.id)?.installed).toBeNull()
    files.delete('C:\\Games\\HQ\\hq.exe')
    refreshManualInstallStates(d, inspector)
    expect(d.games.getById(a.id)?.installed).toBe(false)
    files.set('C:\\Games\\HQ\\hq.exe', 'file')
    refreshManualInstallStates(d, inspector)
    expect(d.games.getById(a.id)?.installed).toBe(true)
    expect(refreshManualInstallStates(d, inspector)).toBe(0)
  })
})
