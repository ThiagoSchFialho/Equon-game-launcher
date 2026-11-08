import {
  isAbsoluteWindowsPath,
  type EmulatorRepository,
  type FileInspector,
  type GameRepository,
  type GenreRepository,
  type LaunchConfigRepository,
  type UnitOfWork
} from '../../core/application'
import {
  EMULATORS,
  isBaseGameRom,
  romGameTitle,
  sameGameName,
  type EmulatorKey,
  type Game
} from '../../core/domain'
import type { IgdbGameFill, Result } from '../../shared/ipc/contract'

/** A folder holds this many entries at most; the rest is not read. */
const MAX_ENTRIES = 5000
const MAX_TITLE = 200

export interface RomLibraryDeps {
  games: GameRepository
  configs: LaunchConfigRepository
  emulators: EmulatorRepository
  genres: GenreRepository
  uow: UnitOfWork
  inspector: FileInspector
  /** Loose files of a folder only: no subfolders, no links (owner decision). */
  listFiles(directory: string): Promise<string[]>
  join(directory: string, name: string): string
  igdb: {
    configured(): boolean
    search(term: string): Promise<{ ok: true; data: { id: number; name: string }[] } | Failed>
    fill(id: number): Promise<{ ok: true; data: IgdbGameFill | null } | Failed>
    applyArtwork(gameId: number, igdbGameId: number): Promise<unknown>
  }
  onLibraryChanged(): void
  /** Games filled from IGDB so far, for the footer; null when it ends. */
  onProgress?(progress: { done: number; total: number } | null): void
  /** A game left with its file's name, and what IGDB had instead: names only, no URL. */
  onNoMatch?(title: string, results: string[]): void
  onError?(error: unknown): void
}

type Failed = { ok: false; error: string }

export interface RomLibrary {
  /**
   * Adds the loose ROMs of each emulator's folder that no game has yet, then fills them from
   * IGDB when a result has the very same name. Concurrent calls share the scan in progress.
   */
  scan(): Promise<{ added: number }>
  /** Validates and saves the folder (null removes it), then scans it. */
  setDirectory(key: EmulatorKey, directory: string | null): Result<null>
}

const fail = (code: string, field?: string): Result<never> => ({
  ok: false,
  error: field ? { code, field } : { code }
})

/** The ROM folder of an emulator (DATA_BASE_CONTEXT.md §3.12). */
export function createRomLibrary(deps: RomLibraryDeps): RomLibrary {
  let pending: Promise<{ added: number }> | null = null

  /** ROM paths that already belong to a game, compared as Windows does: without case. */
  const knownRoms = (): Set<string> =>
    new Set(
      deps.games
        .list()
        .flatMap((game) => deps.configs.get(game.id)?.romPath ?? [])
        .map((path) => path.toLowerCase())
    )

  const addFrom = async (key: EmulatorKey, directory: string): Promise<Game[]> => {
    const emulator = EMULATORS[key]
    let names: string[]
    try {
      names = (await deps.listFiles(directory)).slice(0, MAX_ENTRIES)
    } catch (error) {
      // A folder that cannot be read adds nothing and changes nothing.
      deps.onError?.(error)
      return []
    }
    const known = knownRoms()
    const fresh = names
      .filter((name) => isBaseGameRom(emulator, name))
      .map((name) => ({ path: deps.join(directory, name), title: romGameTitle(name) }))
      .filter(({ path, title }) => title !== '' && !known.has(path.toLowerCase()))
    if (fresh.length === 0) return []
    return deps.uow.transaction(() =>
      fresh.map(({ path, title }) => {
        const game = deps.games.create({
          origin: emulator.origin,
          title: title.slice(0, MAX_TITLE),
          // Just listed in the folder.
          installed: true
        })
        deps.configs.save({
          gameId: game.id,
          executablePath: null,
          romPath: path,
          arguments: [],
          workingDirectory: null
        })
        return game
      })
    )
  }

  /**
   * Nobody confirms this match (owner decision, D-18): only a result with the very same name.
   * Its details, genres and art fill the game; a failure leaves it with its file's name.
   */
  const fillFromIgdb = async (game: Game): Promise<void> => {
    const found = await deps.igdb.search(game.title)
    if (!found.ok) return
    const same = found.data.find((result) => sameGameName(result.name, game.title))
    if (!same) {
      deps.onNoMatch?.(
        game.title,
        found.data.map((result) => result.name)
      )
      return
    }
    const fill = await deps.igdb.fill(same.id)
    if (!fill.ok || !fill.data) return
    const data = fill.data
    deps.uow.transaction(() => {
      deps.games.updateManual(game.id, {
        origin: game.origin,
        // The official name: punctuation a file name cannot have, such as a colon.
        title: data.name.trim().slice(0, MAX_TITLE) || game.title,
        description: data.summary,
        developer: data.developer,
        releaseDate: data.releaseDate,
        requiredAge: data.requiredAge,
        playtimeOffset: game.playtimeOffset
      })
      if (data.genres.length > 0) deps.genres.setGameGenres(game.id, data.genres)
    })
    deps.onLibraryChanged()
    await deps.igdb.applyArtwork(game.id, same.id)
  }

  const runScan = async (): Promise<{ added: number }> => {
    const added: Game[] = []
    for (const config of deps.emulators.list()) {
      if (config.romDirectory) added.push(...(await addFrom(config.key, config.romDirectory)))
    }
    if (added.length === 0) return { added: 0 }
    deps.onLibraryChanged()
    if (deps.igdb.configured()) {
      // One at a time: IGDB has a request limit, and one failure must not stop the rest.
      try {
        for (const [index, game] of added.entries()) {
          deps.onProgress?.({ done: index, total: added.length })
          try {
            await fillFromIgdb(game)
          } catch (error) {
            deps.onError?.(error)
          }
        }
      } finally {
        deps.onProgress?.(null)
      }
    }
    return { added: added.length }
  }

  const scan = (): Promise<{ added: number }> => {
    pending ??= runScan().finally(() => {
      pending = null
    })
    return pending
  }

  return {
    scan,

    setDirectory(key, directory) {
      const path = directory?.trim() || null
      if (path !== null) {
        if (!isAbsoluteWindowsPath(path)) return fail('not-absolute', 'romDirectory')
        const state = deps.inspector.stateOf(path)
        if (state !== 'directory') {
          return fail(state === 'unreadable' ? 'unreadable' : 'missing', 'romDirectory')
        }
      }
      // A folder belongs to a configured emulator.
      if (!deps.emulators.setRomDirectory(key, path)) return fail('not-found')
      if (path !== null) {
        void scan().catch((error) => deps.onError?.(error))
      }
      return { ok: true, data: null }
    }
  }
}
