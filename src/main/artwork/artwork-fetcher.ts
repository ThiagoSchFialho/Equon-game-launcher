import type { ArtworkRepository, GameRepository } from '../../core/application'
import { BuiltinOrigin, toUtcIso, type ArtworkKind, type Game } from '../../core/domain'
import {
  ArtworkImportFailure,
  prepareArtworkBytes,
  writeArtwork
} from '../../infrastructure/artwork/import-artwork'
import type { HttpGet, HttpGetBytes } from '../../integrations/http'
import { fetchAppArtwork, isGeneratedStoreBackground } from '../../integrations/steam/steam-web'
import {
  findBestAsset,
  searchSteamGridDb,
  type SteamGridDbKind,
  type SteamGridDbTarget
} from '../../integrations/steamgriddb/assets'
import type { Result, SteamGridDbGameInfo } from '../../shared/ipc/contract'

/** API requests are spaced like the metadata queue (SteamGridDB: about 500/hour, unconfirmed). */
export const ARTWORK_INTERVAL_MS = 1500

const GRID_KINDS: SteamGridDbKind[] = ['cover_square', 'cover_portrait', 'logo']
/** What the user's own search replaces, for any game (D-15). */
const CHOSEN_KINDS: SteamGridDbKind[] = ['cover_square', 'cover_portrait', 'logo', 'header']

/** How one game went: without an answer it stays to try; with no network the queue stops. */
type QueueOutcome = 'answered' | 'no-answer' | 'no-network'

export interface ArtworkFetcherDeps {
  games: GameRepository
  artwork: ArtworkRepository
  get: HttpGet
  getBytes: HttpGetBytes
  /** Decrypted only in main; null when not configured. */
  gridKey(): string | null
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
  /** The user picked the SteamGridDB game; its art replaces covers, logo and header. */
  applySteamGridDb(gameId: number, steamGridDbGameId: number): Promise<Result<ArtworkKind[]>>
}

/**
 * Artwork queue (ARCHITECTURE.md §3.13, owner decisions of Phase 6c): Steam
 * games get `header_image` and `background_raw` from appdetails, and the
 * best-voted square cover, portrait cover and logo from SteamGridDB when a
 * key is set. Every download is validated (type, size, decoded dimensions,
 * proportion) before it reaches the cache; failures keep the placeholder.
 * A game that got answers is not tried again at the next start, even with no art
 * to show; one that got none stays to try. With no network the queue just stops.
 */
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
    source: 'steam' | 'steamgriddb',
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
      (deps.gridKey() !== null && GRID_KINDS.some(missing))
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
    const missing = missingCheck(game, have)

    if (missing('header') || missing('background')) {
      const urls = await fetchAppArtwork(deps.get, appId)
      if (!urls.ok && urls.error === 'network') return { changed, outcome: 'no-network' }
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
      if (result.error) outcome = 'no-answer'
    }
    return { changed, outcome: storageFailed ? 'no-answer' : outcome }
  }

  const fetchAll = async (retry: boolean): Promise<void> => {
    const kinds = deps.artwork.listKinds()
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
    for (const [done, game] of pending.entries()) {
      deps.onProgress?.({ done, total: pending.length })
      try {
        const { changed, outcome } = await fillSteamGame(game, kinds.get(game.id) ?? [])
        if (changed) deps.onLibraryChanged()
        if (outcome === 'no-network') break
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

    async applySteamGridDb(gameId, steamGridDbGameId) {
      const game = deps.games.getById(gameId)
      if (!game) return { ok: false, error: { code: 'not-found' } }
      const result = await fromSteamGridDb(game, { gameId: steamGridDbGameId }, CHOSEN_KINDS, true)
      if (result.saved.length > 0) deps.onLibraryChanged()
      if (result.error) return { ok: false, error: { code: result.error } }
      return { ok: true, data: result.saved }
    }
  }
}
