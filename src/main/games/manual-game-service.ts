import {
  BuiltinOriginError,
  DuplicateNameError,
  InvalidNameError,
  LaunchError,
  ManualGameValidationError,
  NotFoundError,
  OriginInUseError,
  saveManualGame,
  validateManualGame,
  isAbsoluteWindowsPath,
  type EmulatorRepository,
  type FileInspector,
  type GameFlags,
  type GameRepository,
  type GameRunner,
  type LaunchConfigRepository,
  type OriginRepository,
  type UnitOfWork,
  type GenreRepository
} from '../../core/application'
import {
  BuiltinOrigin,
  EMULATOR_KEYS,
  EMULATORS,
  type EmulatorConfig,
  type EmulatorKey,
  type Origin
} from '../../core/domain'
import { removeGameArtwork } from '../../infrastructure/artwork/import-artwork'
import { matchesPickKind } from '../../infrastructure/filesystem/file-browser'
import type {
  AppError,
  EmulatorInfo,
  ManualGameForm,
  OriginInfo,
  Result
} from '../../shared/ipc/contract'

export interface ManualGameServiceDeps {
  genres: GenreRepository
  games: GameRepository
  configs: LaunchConfigRepository
  origins: OriginRepository
  emulators: EmulatorRepository
  uow: UnitOfWork
  inspector: FileInspector
  runner: GameRunner
  artworkCacheDir: string
  /** Full image decode returning the real size (Electron nativeImage in main). */
  /** URL= target of a .url shortcut, or null. */
  readShortcut: (path: string) => string | null
}

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const failure = (code: string, field?: string): Result<never> => ({
  ok: false,
  error: field ? { code, field } : { code }
})

/** Maps expected errors to codes the renderer turns into messages; rethrows the rest. */
export function toAppError(error: unknown): AppError {
  if (error instanceof ManualGameValidationError) return { code: error.code, field: error.field }
  if (error instanceof LaunchError) return { code: error.code }
  if (error instanceof DuplicateNameError) return { code: 'duplicate-name', field: 'name' }
  if (error instanceof InvalidNameError) return { code: 'invalid-name', field: 'name' }
  if (error instanceof BuiltinOriginError) return { code: 'builtin-origin' }
  if (error instanceof OriginInUseError) return { code: 'origin-in-use' }
  if (error instanceof NotFoundError) return { code: 'not-found' }
  throw error
}

async function asResult<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn())
  } catch (error) {
    return { ok: false, error: toAppError(error) }
  }
}

const toOriginInfo = (origin: Origin): OriginInfo => ({ ...origin })

export interface ManualGameService {
  create(form: ManualGameForm): Promise<Result<{ id: number }>>
  update(id: number, form: ManualGameForm): Promise<Result<{ id: number }>>
  remove(id: number): Promise<Result<null>>
  launch(id: number): Promise<Result<null>>
  setFlags(id: number, flags: GameFlags): Promise<Result<null>>
  createOrigin(name: string): Promise<Result<OriginInfo>>
  renameOrigin(key: string, name: string): Promise<Result<OriginInfo>>
  removeOrigin(key: string): Promise<Result<null>>
  listEmulators(): EmulatorInfo[]
  setEmulator(key: string, executablePath: string): Promise<Result<EmulatorInfo>>
  removeEmulator(key: string): Promise<Result<null>>
}

export function createManualGameService(deps: ManualGameServiceDeps): ManualGameService {
  const originExists = (key: string): boolean => deps.origins.list().some((o) => o.key === key)

  // Everything is validated before anything is written.
  const save = (form: ManualGameForm, id?: number): Promise<Result<{ id: number }>> =>
    asResult(() => {
      if (id !== undefined) {
        const existing = deps.games.getById(id)
        if (!existing || existing.origin === BuiltinOrigin.steam)
          throw new NotFoundError('Game', id)
      }
      const { executablePath, romPath, arguments: args, workingDirectory, genres, ...fields } = form
      const input = validateManualGame(
        {
          ...fields,
          launch: {
            executablePath: executablePath || null,
            romPath,
            arguments: args,
            workingDirectory
          }
        },
        { inspector: deps.inspector, originExists, readShortcut: deps.readShortcut }
      )
      const game = saveManualGame(deps, input, id)
      // Filled from IGDB: the genres of a game that has them are not replaced.
      if (genres && genres.length > 0 && deps.genres.listForGame(game.id).length === 0) {
        deps.genres.setGameGenres(game.id, genres)
      }
      return { id: game.id }
    })

  return {
    create: (form: ManualGameForm) => save(form),
    update: (id: number, form: ManualGameForm) => save(form, id),

    remove: (id: number): Promise<Result<null>> =>
      asResult(() => {
        const game = deps.games.getById(id)
        if (!game || game.origin === BuiltinOrigin.steam) throw new NotFoundError('Game', id)
        if (deps.runner.runningGameIds().includes(id)) throw new LaunchError('already-running')
        deps.games.delete(id)
        removeGameArtwork(deps.artworkCacheDir, id)
        return null
      }),

    launch: (id: number): Promise<Result<null>> =>
      asResult(async () => {
        await deps.runner.launch(id)
        return null
      }),

    setFlags: (id: number, flags: GameFlags): Promise<Result<null>> =>
      asResult(() => {
        deps.games.setFlags(id, flags)
        return null
      }),

    createOrigin: (name: string) => asResult(() => toOriginInfo(deps.origins.create(name))),
    renameOrigin: (key: string, name: string) =>
      asResult(() => toOriginInfo(deps.origins.rename(key, name))),
    removeOrigin: (key: string): Promise<Result<null>> =>
      asResult(() => {
        deps.origins.delete(key)
        return null
      }),

    listEmulators: () => EMULATOR_KEYS.map((key) => toEmulatorInfo(key, deps.emulators.get(key))),

    setEmulator: (key: string, executablePath: string) => {
      if (!isEmulatorKey(key)) return Promise.resolve(failure('not-found'))
      const check = validateEmulator(executablePath, deps.inspector)
      if (check) return Promise.resolve(check)
      return asResult(() => toEmulatorInfo(key, deps.emulators.set(key, executablePath.trim())))
    },

    removeEmulator: (key: string): Promise<Result<null>> => {
      if (!isEmulatorKey(key)) return Promise.resolve(failure('not-found'))
      deps.emulators.remove(key)
      return Promise.resolve(ok(null))
    }
  }
}

const isEmulatorKey = (key: string): key is EmulatorKey =>
  (EMULATOR_KEYS as readonly string[]).includes(key)

function toEmulatorInfo(key: EmulatorKey, config: EmulatorConfig | null): EmulatorInfo {
  const emulator = EMULATORS[key]
  return {
    key,
    name: emulator.name,
    origin: emulator.origin,
    romExtensions: [...emulator.romExtensions],
    executablePath: config?.executablePath ?? null
  }
}

function validateEmulator(path: string, inspector: FileInspector): Result<never> | null {
  if (!isAbsoluteWindowsPath(path)) return failure('not-absolute', 'executablePath')
  if (!matchesPickKind(path, 'emulator')) return failure('not-exe', 'executablePath')
  const state = inspector.stateOf(path)
  if (state === 'missing') return failure('missing', 'executablePath')
  if (state !== 'file')
    return failure(state === 'directory' ? 'not-file' : 'unreadable', 'executablePath')
  return null
}
