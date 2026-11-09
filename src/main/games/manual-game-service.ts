import {
  BuiltinOriginError,
  DuplicateNameError,
  InvalidNameError,
  LaunchError,
  ManualGameValidationError,
  NotFoundError,
  OriginInUseError,
  removeSteamGame,
  saveManualGame,
  validateGameDetails,
  validateManualGame,
  isAbsoluteWindowsPath,
  type EmulatorRepository,
  type FileInspector,
  type GameFlags,
  type GameRepository,
  type GameRunner,
  type LaunchConfigRepository,
  type OriginRepository,
  type SteamIgnoredRepository,
  type UnitOfWork,
  type UserRepository,
  type GenreRepository
} from '../../core/application'
import {
  BuiltinOrigin,
  EMULATOR_KEYS,
  toUtcIso,
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
  IgnoredSteamGameInfo,
  ManualGameForm,
  OriginInfo,
  Result,
  SteamGameForm
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
  /** Trophy counters are recomputed when a Steam game leaves (D-26). */
  users: Pick<UserRepository, 'recomputeTrophyCounters'>
  /** Steam games removed with an exception (D-26). */
  ignored: SteamIgnoredRepository
  clock: { now(): Date }
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
  /** Only the details of a Steam game; title, launch and playtime stay Steam's. */
  updateSteam(id: number, form: SteamGameForm): Promise<Result<{ id: number }>>
  remove(id: number): Promise<Result<null>>
  /**
   * Removes a Steam game from the launcher, never from the account (D-26); with `ignore` it
   * becomes an exception that no sync adds back.
   */
  removeSteam(id: number, ignore: boolean): Promise<Result<null>>
  /** The exceptions, by title. */
  listIgnoredSteam(): IgnoredSteamGameInfo[]
  /** The game comes back on the user's next "Atualizar biblioteca". */
  unignoreSteam(steamAppId: number): Promise<Result<null>>
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
      fillGenres(game.id, genres)
      return { id: game.id }
    })

  // Filled from IGDB: the genres of a game that has them are not replaced.
  const fillGenres = (gameId: number, genres: string[] | undefined): void => {
    if (genres && genres.length > 0 && deps.genres.listForGame(gameId).length === 0) {
      deps.genres.setGameGenres(gameId, genres)
    }
  }

  return {
    create: (form: ManualGameForm) => save(form),
    update: (id: number, form: ManualGameForm) => save(form, id),

    updateSteam: (id: number, form: SteamGameForm) =>
      asResult(() => {
        const { genres, ...fields } = form
        const details = validateGameDetails(fields)
        return deps.uow.transaction(() => {
          // NotFoundError for anything but a Steam game.
          const game = deps.games.updateSteamDetails(id, details)
          fillGenres(game.id, genres)
          return { id: game.id }
        })
      }),

    remove: (id: number): Promise<Result<null>> =>
      asResult(() => {
        const game = deps.games.getById(id)
        if (!game || game.origin === BuiltinOrigin.steam) throw new NotFoundError('Game', id)
        if (deps.runner.runningGameIds().includes(id)) throw new LaunchError('already-running')
        deps.games.delete(id)
        removeGameArtwork(deps.artworkCacheDir, id)
        return null
      }),

    removeSteam: (id: number, ignore: boolean): Promise<Result<null>> =>
      asResult(() => {
        if (deps.runner.runningGameIds().includes(id)) throw new LaunchError('already-running')
        removeSteamGame(deps, id, { ignore, at: toUtcIso(deps.clock.now()) })
        removeGameArtwork(deps.artworkCacheDir, id)
        return null
      }),

    listIgnoredSteam: () => deps.ignored.list().map((game) => ({ ...game })),

    unignoreSteam: (steamAppId: number): Promise<Result<null>> =>
      asResult(() => {
        if (!deps.ignored.release(steamAppId)) throw new NotFoundError('Game', steamAppId)
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
    executablePath: config?.executablePath ?? null,
    romDirectory: config?.romDirectory ?? null
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
