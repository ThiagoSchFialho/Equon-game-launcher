import type { ArtworkRepository, GameRepository } from '../../core/application'
import { BuiltinOrigin, toUtcIso, type ArtworkKind, type Game } from '../../core/domain'
import {
  ArtworkImportFailure,
  prepareArtworkBytes,
  writeArtwork
} from '../../infrastructure/artwork/import-artwork'
import type { HttpGet, HttpGetBytes } from '../../integrations/http'
import { igdbImageUrl, pickIgdbBackground, type IgdbGameData } from '../../integrations/igdb/games'
import type { IgdbResult } from '../../integrations/igdb/igdb'
import { fetchAppArtwork, isGeneratedStoreBackground } from '../../integrations/steam/steam-web'
import {
  findBestAsset,
  searchSteamGridDb,
  type SteamGridDbKind,
  type SteamGridDbTarget
} from '../../integrations/steamgriddb/assets'
import type { Result, SteamGridDbGameInfo } from '../../shared/ipc/contract'
import { UNAVAILABLE_LIMIT, UNAVAILABLE_WAIT_MS } from '../queue-pacing'

/** API requests are spaced like the metadata queue (SteamGridDB: about 500/hour, unconfirmed). */
export const ARTWORK_INTERVAL_MS = 1500

const GRID_KINDS: SteamGridDbKind[] = ['cover_square', 'cover_portrait', 'logo']
/** What IGDB gives a game (D-18). */
const IGDB_KINDS: ArtworkKind[] = ['cover_portrait', 'background', 'logo']
/** What the user's own search replaces, for any game (D-15). */
const CHOSEN_KINDS: SteamGridDbKind[] = ['cover_square', 'cover_portrait', 'logo', 'header']

/**
 * How one game went: without an answer it stays to try. With no network the queue stops;
 * a server that answers but cannot serve makes it wait (see queue-pacing).
 */
type QueueOutcome = 'answered' | 'no-answer' | 'no-network' | 'unavailable'

export interface ArtworkFetcherDeps {
  games: GameRepository
  artwork: ArtworkRepository
  get: HttpGet
  getBytes: HttpGetBytes
  /** Decrypted only in main; null when not configured. */
  gridKey(): string | null
  /** Whether both IGDB credentials are set. */
  igdbConfigured(): boolean
  /** One game from IGDB (D-18). */
  igdbGame(id: number): Promise<IgdbResult<IgdbGameData | null>>
  /** The same, by Steam App ID. */
  igdbSteamGame(appId: number): Promise<IgdbResult<IgdbGameData | null>>
  cacheDir: string
  decode(bytes: Buffer): { width: number; height: number } | null
  clock: { now(): Date }
  wait(ms: number): Promise<void>
  onLibraryChanged(): void
  /** Progress of the queue of missing art, in games; null when it ends. */
  onProgress?(progress: { done: number; total: number } | null): void
  onError?(error: unknown): void
}

export interface ArtworkFetcher {
  /**
   * Steam games: fills missing art only (never replaces what exists or what the
   * user chose). Games already answered are skipped, unless `retry` is set: an
   * explicit action, like the refresh button or saving a SteamGridDB key.
   */
  fetchMissing(options?: { retry?: boolean }): Promise<void>
  search(term: string): Promise<Result<SteamGridDbGameInfo[]>>
  /**
   * A manual game filled from IGDB (D-18): portrait cover, logo and background from IGDB,
   * the rest from SteamGridDB under the same name. Only what the game does not have yet.
   */
  applyIgdb(gameId: number, igdbGameId: number): Promise<Result<ArtworkKind[]>>
}

/**
 * Artwork queue (ARCHITECTURE.md §3.13 and §3.17): with IGDB credentials, Steam
 * games get their portrait cover, logo and background from IGDB first. The header
 * comes from appdetails, as does a background IGDB does not have; the best-voted
 * square cover, and a portrait cover or logo IGDB does not have, come from
 * SteamGridDB when a key is set. Every download is validated (type, size, decoded dimensions,
 * proportion) before it reaches the cache; failures keep the placeholder.
 * A game that got answers is not tried again at the next start, even with no art
 * to show; one that got none stays to try. With no network the queue just stops.
 */
/** Where IGDB keeps each image of a game; null when it has none that fits. */
export function igdbArtUrls(data: IgdbGameData): [ArtworkKind, string | null][] {
  const background = pickIgdbBackground(data)
  return [
    ['cover_portrait', data.cover ? igdbImageUrl(data.cover.imageId, '1080p') : null],
    ['background', background ? igdbImageUrl(background.imageId, '1080p') : null],
    // Logos need the PNG: the JPEG would lose their transparency.
    ['logo', data.logos[0] ? igdbImageUrl(data.logos[0].imageId, '1080p', 'png') : null]
  ]
}

export function createArtworkFetcher(deps: ArtworkFetcherDeps): ArtworkFetcher {
  let run: Promise<void> | null = null
  let runIsRetry = false
  /** A disk that cannot be written is not an answer about the game. */
  let storageFailed = false

  /** Downloads, validates and stores one image; false when anything failed. */
  const store = async (
    game: Game,
    kind: ArtworkKind,
    url: string,
    source: 'steam' | 'steamgriddb' | 'igdb',
    userSelected: boolean
  ): Promise<boolean> => {
    const bytes = await deps.getBytes(url)
    if (bytes === null) return false
    try {
      const prepared = prepareArtworkBytes(Buffer.from(bytes), kind, deps.decode)
      const written = writeArtwork(deps.cacheDir, game.id, kind, prepared)
      return deps.artwork.save({
        gameId: game.id,
        kind,
        localPath: written.localPath,
        source,
        sourceUrl: url,
        width: written.width,
        height: written.height,
        userSelected,
        fetchedAt: toUtcIso(deps.clock.now())
      })
    } catch (error) {
      if (!(error instanceof ArtworkImportFailure)) {
        storageFailed = true
        deps.onError?.(error)
      }
      return false
    }
  }

  const fromSteamGridDb = async (
    game: Game,
    target: SteamGridDbTarget,
    kinds: SteamGridDbKind[],
    userSelected: boolean
  ): Promise<{ saved: ArtworkKind[]; error: string | null }> => {
    const key = deps.gridKey()
    if (!key) return { saved: [], error: 'not-configured' }
    const saved: ArtworkKind[] = []
    for (const kind of kinds) {
      const best = await findBestAsset(deps.get, key, target, kind)
      await deps.wait(ARTWORK_INTERVAL_MS)
      // A bad key or an outage stops this game; the next scan tries again.
      if (!best.ok) return { saved, error: best.error }
      if (best.data && (await store(game, kind, best.data, 'steamgriddb', userSelected))) {
        saved.push(kind)
      }
    }
    return { saved, error: null }
  }

  const missingCheck = (game: Game, have: readonly ArtworkKind[]) => {
    // A blurred store-generated background (stored before the screenshot rule) counts as missing.
    const stored = deps.artwork.get(game.id, 'background')
    const generated =
      stored !== null && !stored.userSelected && isGeneratedStoreBackground(stored.sourceUrl ?? '')
    return (kind: ArtworkKind): boolean =>
      !have.includes(kind) || (kind === 'background' && generated)
  }

  /** Whether the queue has anything to try for this game; matches what fillSteamGame does. */
  const hasWork = (game: Game, have: readonly ArtworkKind[]): boolean => {
    const missing = missingCheck(game, have)
    return (
      missing('header') ||
      missing('background') ||
      (deps.gridKey() !== null && GRID_KINDS.some(missing)) ||
      (deps.igdbConfigured() && IGDB_KINDS.some(missing))
    )
  }

  const fillSteamGame = async (
    game: Game,
    have: readonly ArtworkKind[]
  ): Promise<{ changed: boolean; outcome: QueueOutcome }> => {
    const appId = game.steamAppId as number
    let changed = false
    let outcome: QueueOutcome = 'answered'
    storageFailed = false
    const notInCache = missingCheck(game, have)
    const fromIgdb = new Set<ArtworkKind>()
    const missing = (kind: ArtworkKind): boolean => notInCache(kind) && !fromIgdb.has(kind)

    if (deps.igdbConfigured() && IGDB_KINDS.some(missing)) {
      const answer = await deps.igdbSteamGame(appId)
      await deps.wait(ARTWORK_INTERVAL_MS)
      if (!answer.ok && answer.error === 'network') return { changed, outcome: 'no-network' }
      // IGDB failing must not cost this game the other sources; it stays to try.
      if (!answer.ok) outcome = 'no-answer'
      if (answer.ok && answer.data) {
        for (const [kind, url] of igdbArtUrls(answer.data)) {
          if (url !== null && missing(kind) && (await store(game, kind, url, 'igdb', false))) {
            fromIgdb.add(kind)
            changed = true
          }
        }
      }
    }

    if (missing('header') || missing('background')) {
      const urls = await fetchAppArtwork(deps.get, appId)
      if (!urls.ok && urls.error === 'network') return { changed, outcome: 'no-network' }
      if (!urls.ok && urls.error === 'unavailable') return { changed, outcome: 'unavailable' }
      await deps.wait(ARTWORK_INTERVAL_MS)
      // "not-found" is an answer: the store has no page for this game.
      if (!urls.ok && urls.error !== 'not-found') outcome = 'no-answer'
      if (urls.ok) {
        if (missing('header') && urls.data.header) {
          changed = (await store(game, 'header', urls.data.header, 'steam', false)) || changed
        }
        if (missing('background') && urls.data.background) {
          changed =
            (await store(game, 'background', urls.data.background, 'steam', false)) || changed
        }
      }
    }
    const gridKinds = GRID_KINDS.filter(missing)
    if (gridKinds.length > 0 && deps.gridKey()) {
      const result = await fromSteamGridDb(game, { steamAppId: appId }, gridKinds, false)
      changed = result.saved.length > 0 || changed
      if (result.error === 'network') return { changed, outcome: 'no-network' }
      if (result.error === 'unavailable') return { changed, outcome: 'unavailable' }
      if (result.error) outcome = 'no-answer'
    }
    return { changed, outcome: storageFailed ? 'no-answer' : outcome }
  }

  const fetchAll = async (retry: boolean): Promise<void> => {
    const stored = deps.artwork.listKinds()
    const removed = deps.artwork.listRemoved()
    // Art the user removed is not missing: it stays out until the user chooses another.
    const kinds = new Map(
      deps.games
        .list()
        .map((game): [number, ArtworkKind[]] => [
          game.id,
          [...(stored.get(game.id) ?? []), ...(removed.get(game.id) ?? [])]
        ])
    )
    const pending = deps.games
      .list()
      .filter(
        (game) =>
          game.origin === BuiltinOrigin.steam &&
          game.steamAppId !== null &&
          (retry || game.artworkCheckedAt === null) &&
          hasWork(game, kinds.get(game.id) ?? [])
      )
    if (pending.length === 0) return
    let unavailable = 0
    for (const [done, game] of pending.entries()) {
      deps.onProgress?.({ done, total: pending.length })
      try {
        const { changed, outcome } = await fillSteamGame(game, kinds.get(game.id) ?? [])
        if (changed) deps.onLibraryChanged()
        if (outcome === 'no-network') break
        if (outcome === 'unavailable') {
          if (++unavailable >= UNAVAILABLE_LIMIT) break
          await deps.wait(UNAVAILABLE_WAIT_MS)
          continue
        }
        unavailable = 0
        if (outcome === 'answered') {
          deps.games.setArtworkChecked(game.id, toUtcIso(deps.clock.now()))
        }
      } catch (error) {
        deps.onError?.(error)
      }
    }
    deps.onProgress?.(null)
  }

  return {
    fetchMissing(options = {}) {
      const retry = options.retry ?? false
      const start = (): Promise<void> => {
        runIsRetry = retry
        const current: Promise<void> = fetchAll(retry).finally(() => {
          if (run === current) run = null
        })
        run = current
        return current
      }
      if (!run) return start()
      // An explicit retry must not be swallowed by a run that skips answered games.
      if (retry && !runIsRetry) return run.then(start)
      return run
    },

    async search(term) {
      const key = deps.gridKey()
      if (!key) return { ok: false, error: { code: 'not-configured' } }
      const result = await searchSteamGridDb(deps.get, key, term)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: { code: result.error } }
    },

    async applyIgdb(gameId, igdbGameId) {
      const game = deps.games.getById(gameId)
      if (!game || game.origin === BuiltinOrigin.steam) {
        return { ok: false, error: { code: 'not-found' } }
      }
      const answer = await deps.igdbGame(igdbGameId)
      if (!answer.ok) return { ok: false, error: { code: answer.error } }
      if (!answer.data) return { ok: false, error: { code: 'not-found' } }
      const data = answer.data

      const have = (): ArtworkKind[] => [
        ...(deps.artwork.listKinds().get(gameId) ?? []),
        ...(deps.artwork.listRemoved().get(gameId) ?? [])
      ]
      const saved: ArtworkKind[] = []
      const wanted = igdbArtUrls(data).filter(
        ([kind, url]) => url !== null && !have().includes(kind)
      )
      for (const [index, [kind, url]] of wanted.entries()) {
        deps.onProgress?.({ done: index, total: wanted.length })
        if (await store(game, kind, url as string, 'igdb', true)) {
          saved.push(kind)
          // The game page is already open: each image shows as it arrives.
          deps.onLibraryChanged()
        }
      }
      deps.onProgress?.(null)

      // What IGDB does not have. Only under the very same name: nobody confirms this match.
      const missing = CHOSEN_KINDS.filter((kind) => !have().includes(kind))
      const key = deps.gridKey()
      if (key && missing.length > 0) {
        const found = await searchSteamGridDb(deps.get, key, data.name)
        const same = found.ok
          ? found.data.find(
              (g) =>
                g.name
                  .trim()
                  .localeCompare(data.name.trim(), undefined, { sensitivity: 'base' }) === 0
            )
          : undefined
        if (same) {
          const grid = await fromSteamGridDb(game, { gameId: same.id }, missing, true)
          saved.push(...grid.saved)
          if (grid.saved.length > 0) deps.onLibraryChanged()
        }
      }
      return { ok: true, data: saved }
    }
  }
}
