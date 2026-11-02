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
  type ArtworkRepository,
  type FileInspector,
  type GameRepository,
  type GameRunner,
  type LaunchConfigRepository,
  type OriginRepository,
  type UnitOfWork
} from '../../core/application'
import { BuiltinOrigin, toUtcIso, type Origin } from '../../core/domain'
import {
  ArtworkImportFailure,
  prepareArtwork,
  removeGameArtwork,
  writeArtwork,
  type PreparedArtwork
} from '../../infrastructure/artwork/import-artwork'
import { matchesPickKind } from '../../infrastructure/filesystem/file-browser'
import type { AppError, ManualGameForm, OriginInfo, Result } from '../../shared/ipc/contract'

export interface ManualGameServiceDeps {
  games: GameRepository
  configs: LaunchConfigRepository
  origins: OriginRepository
  artwork: ArtworkRepository
  uow: UnitOfWork
  inspector: FileInspector
  runner: GameRunner
  artworkCacheDir: string
  /** Full image decode returning the real size (Electron nativeImage in main). */
  decodeImage: (bytes: Buffer) => { width: number; height: number } | null
}

const ok = <T>(data: T): Result<T> => ({ ok: true, data })
const failure = (code: string, field?: string): Result<never> => ({
  ok: false,
  error: field ? { code, field } : { code }
})

/** Maps expected errors to codes the renderer turns into messages; rethrows the rest. */
export function toAppError(error: unknown): AppError {
  if (error instanceof ManualGameValidationError) return { code: error.code, field: error.field }
  if (error instanceof ArtworkImportFailure) return { code: error.code, field: 'backgroundPath' }
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
  createOrigin(name: string): Promise<Result<OriginInfo>>
  renameOrigin(key: string, name: string): Promise<Result<OriginInfo>>
  removeOrigin(key: string): Promise<Result<null>>
  setOriginDefaults(
    key: string,
    executablePath: string | null,
    args: string[] | null
  ): Promise<Result<OriginInfo>>
}

export function createManualGameService(deps: ManualGameServiceDeps): ManualGameService {
  const originExists = (key: string): boolean => deps.origins.list().some((o) => o.key === key)

  const prepareBackground = (path: string | null): PreparedArtwork | null => {
    if (path === null) return null
    if (!matchesPickKind(path, 'image')) throw new ArtworkImportFailure('unsupported-type')
    return prepareArtwork(path, 'background', deps.decodeImage)
  }

  const saveBackground = (gameId: number, prepared: PreparedArtwork | null): void => {
    if (!prepared) return
    const written = writeArtwork(deps.artworkCacheDir, gameId, 'background', prepared)
    deps.artwork.save({
      gameId,
      kind: 'background',
      localPath: written.localPath,
      source: 'user',
      sourceUrl: null,
      width: written.width,
      height: written.height,
      userSelected: true,
      fetchedAt: toUtcIso(new Date())
    })
  }

  // Everything is validated (fields, paths, image) before anything is written.
  const save = (form: ManualGameForm, id?: number): Promise<Result<{ id: number }>> =>
    asResult(() => {
      if (id !== undefined) {
        const existing = deps.games.getById(id)
        if (!existing || existing.origin === BuiltinOrigin.steam)
          throw new NotFoundError('Game', id)
      }
      const { executablePath, arguments: args, workingDirectory, backgroundPath, ...fields } = form
      const input = validateManualGame(
        { ...fields, launch: { executablePath, arguments: args, workingDirectory } },
        deps.inspector,
        originExists
      )
      const background = prepareBackground(backgroundPath)
      const game = saveManualGame(deps, input, id)
      saveBackground(game.id, background)
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

    createOrigin: (name: string) => asResult(() => toOriginInfo(deps.origins.create(name))),
    renameOrigin: (key: string, name: string) =>
      asResult(() => toOriginInfo(deps.origins.rename(key, name))),
    removeOrigin: (key: string): Promise<Result<null>> =>
      asResult(() => {
        deps.origins.delete(key)
        return null
      }),

    setOriginDefaults: (key: string, executablePath: string | null, args: string[] | null) => {
      if (key === BuiltinOrigin.steam) return Promise.resolve(failure('invalid', 'origin'))
      if (executablePath !== null) {
        const check = validateEmulator(executablePath, deps.inspector)
        if (check) return Promise.resolve(check)
      }
      return asResult(() =>
        toOriginInfo(
          deps.origins.setDefaults(key, executablePath, executablePath ? (args ?? []) : null)
        )
      )
    }
  }
}

function validateEmulator(path: string, inspector: FileInspector): Result<never> | null {
  if (!matchesPickKind(path, 'executable')) return failure('not-exe', 'executablePath')
  const state = inspector.stateOf(path)
  if (state === 'missing') return failure('missing', 'executablePath')
  if (state !== 'file')
    return failure(state === 'directory' ? 'not-file' : 'unreadable', 'executablePath')
  return null
}
