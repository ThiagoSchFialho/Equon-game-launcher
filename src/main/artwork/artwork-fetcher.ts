import type { ArtworkRepository, GameRepository } from '../../core/application'
import { BuiltinOrigin, toUtcIso, type ArtworkKind, type Game } from '../../core/domain'
import {
  ArtworkImportFailure,
  prepareArtworkBytes,
  writeArtwork
} from '../../infrastructure/artwork/import-artwork'
import type { HttpGet, HttpGetBytes } from '../../integrations/http'
import { fetchAppArtwork } from '../../integrations/steam/steam-web'
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
/** For manual games the header also comes from SteamGridDB (D-15). */
const MANUAL_KINDS: SteamGridDbKind[] = ['cover_square', 'cover_portrait', 'logo', 'header']

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
  onError?(error: unknown): void
}

export interface ArtworkFetcher {
  /** Steam games: fills missing art only (never replaces what exists or what the user chose). */
  fetchMissing(): Promise<void>
  search(term: string): Promise<Result<SteamGridDbGameInfo[]>>
  /** Manual games: the user picked the SteamGridDB game; its art replaces covers, logo and header. */
  applySteamGridDb(gameId: number, steamGridDbGameId: number): Promise<Result<ArtworkKind[]>>
}

/**
 * Artwork queue (ARCHITECTURE.md §3.13, owner decisions of Phase 6c): Steam
 * games get `header_image` and `background_raw` from appdetails, and the
 * best-voted square cover, portrait cover and logo from SteamGridDB when a
 * key is set. Every download is validated (type, size, decoded dimensions,
 * proportion) before it reaches the cache; failures keep the placeholder
 * and are retried on the next scan.
 */
export function createArtworkFetcher(deps: ArtworkFetcherDeps): ArtworkFetcher {
  let run: Promise<void> | null = null

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
      if (!(error instanceof ArtworkImportFailure)) deps.onError?.(error)
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

  const fillSteamGame = async (game: Game, have: readonly ArtworkKind[]): Promise<boolean> => {
    const appId = game.steamAppId as number
    let changed = false
    const missing = (kind: ArtworkKind): boolean => !have.includes(kind)

    if (missing('header') || missing('background')) {
      const urls = await fetchAppArtwork(deps.get, appId)
      await deps.wait(ARTWORK_INTERVAL_MS)
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
    }
    return changed
  }

  const fetchAll = async (): Promise<void> => {
    const kinds = deps.artwork.listKinds()
    for (const game of deps.games.list()) {
      if (game.origin !== BuiltinOrigin.steam || game.steamAppId === null) continue
      try {
        if (await fillSteamGame(game, kinds.get(game.id) ?? [])) deps.onLibraryChanged()
      } catch (error) {
        deps.onError?.(error)
      }
    }
  }

  return {
    fetchMissing() {
      run ??= fetchAll().finally(() => {
        run = null
      })
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
      if (!game || game.origin === BuiltinOrigin.steam) {
        return { ok: false, error: { code: 'not-found' } }
      }
      const result = await fromSteamGridDb(game, { gameId: steamGridDbGameId }, MANUAL_KINDS, true)
      if (result.saved.length > 0) deps.onLibraryChanged()
      if (result.error) return { ok: false, error: { code: result.error } }
      return { ok: true, data: result.saved }
    }
  }
}
