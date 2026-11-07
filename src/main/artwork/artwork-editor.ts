import type { ArtworkRepository, GameRepository, UnitOfWork } from '../../core/application'
import { isAbsoluteWindowsPath } from '../../core/application'
import { BuiltinOrigin, toUtcIso, type ArtworkKind } from '../../core/domain'
import {
  ArtworkImportFailure,
  detectImageType,
  hasExpectedProportion,
  prepareArtwork,
  prepareArtworkBytes,
  removeArtworkFile,
  writeArtwork,
  type PreparedArtwork
} from '../../infrastructure/artwork/import-artwork'
import { matchesPickKind } from '../../infrastructure/filesystem/file-browser'
import type { HttpGet, HttpGetBytes } from '../../integrations/http'
import type { IgdbGameData } from '../../integrations/igdb/games'
import type { IgdbResult } from '../../integrations/igdb/igdb'
import { fetchAppBackgroundChoices } from '../../integrations/steam/steam-web'
import { listAssets, type SteamGridDbTarget } from '../../integrations/steamgriddb/assets'
import type {
  ArtworkDraftInfo,
  ArtworkEditKind,
  GridAssetInfo,
  Result,
  SteamChoiceInfo
} from '../../shared/ipc/contract'
import { igdbArtUrls } from './artwork-fetcher'

/** Kinds with no source on IGDB (square covers) or none that fits on SteamGridDB (backgrounds). */
const IGDB_KINDS: readonly ArtworkEditKind[] = ['cover_portrait', 'logo', 'background']
const GRID_KINDS = ['cover_portrait', 'cover_square', 'logo'] as const
type GridKind = (typeof GRID_KINDS)[number]
const isGridKind = (kind: ArtworkEditKind): kind is GridKind =>
  (GRID_KINDS as readonly string[]).includes(kind)

/** As many as the SteamGridDB gallery shows. */
const MAX_STEAM_CHOICES = 40
/** Thumbnails measured at a time, to go easy on the store. */
const MEASURED_AT_ONCE = 6

const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const

export interface ServedImage {
  bytes: Buffer
  mime: string
}

interface Draft {
  prepared: PreparedArtwork
  source: 'user' | 'igdb' | 'steamgriddb' | 'steam'
  sourceUrl: string | null
}

export interface ArtworkEditorDeps {
  games: GameRepository
  artwork: ArtworkRepository
  uow: UnitOfWork
  get: HttpGet
  getBytes: HttpGetBytes
  gridKey(): string | null
  igdbGame(id: number): Promise<IgdbResult<IgdbGameData | null>>
  igdbSteamGame(appId: number): Promise<IgdbResult<IgdbGameData | null>>
  cacheDir: string
  decode(bytes: Buffer): { width: number; height: number } | null
  clock: { now(): Date }
  onLibraryChanged(): void
  onError?(error: unknown): void
}

export interface ArtworkEditor {
  /** Opens the screen for one game; whatever was pending is dropped. */
  begin(gameId: number): void
  /** Leaves the screen; pending images are dropped, nothing is written. */
  end(): void
  fromFile(gameId: number, kind: ArtworkEditKind, path: string): Result<ArtworkDraftInfo>
  /** `igdbGameId` null: a Steam game, looked up by its App ID. */
  fromIgdb(
    gameId: number,
    kind: ArtworkEditKind,
    igdbGameId: number | null
  ): Promise<Result<ArtworkDraftInfo>>
  /** `gridGameId` null: a Steam game, looked up by its App ID. */
  gridAssets(
    gameId: number,
    kind: ArtworkEditKind,
    gridGameId: number | null
  ): Promise<Result<GridAssetInfo[]>>
  fromGrid(
    gameId: number,
    kind: ArtworkEditKind,
    assetId: number
  ): Promise<Result<ArtworkDraftInfo>>
  /** The store background and screenshots of a Steam game, for its background. */
  steamChoices(gameId: number): Promise<Result<SteamChoiceInfo[]>>
  fromSteam(gameId: number, choiceId: number): Promise<Result<ArtworkDraftInfo>>
  /** Applies what is pending, and removes `remove`; a kind in both ends up removed. */
  save(gameId: number, remove: readonly ArtworkEditKind[]): Result<null>
  /** Served by the art protocol, so the preview needs no file on disk. */
  draftImage(kind: ArtworkKind): ServedImage | null
  gridThumbnail(assetId: number): Promise<ServedImage | null>
  steamThumbnail(choiceId: number): Promise<ServedImage | null>
}

const fail = (code: string): { ok: false; error: { code: string } } => ({
  ok: false,
  error: { code }
})

/**
 * "Editar artes" (ARCHITECTURE.md §3.18). Chosen images wait in memory until Salvar, so
 * Cancelar or a crash leaves nothing behind. Addresses of SteamGridDB and Steam images stay
 * here too: the renderer only names an id this service listed, and never sends a URL.
 */
export function createArtworkEditor(deps: ArtworkEditorDeps): ArtworkEditor {
  let current: number | null = null
  let version = 0
  const drafts = new Map<ArtworkEditKind, Draft>()
  const assets = new Map<number, { url: string; thumb: string }>()
  const steamImages = new Map<number, { url: string; thumb: string }>()
  /**
   * Never reused while the app runs: the browser may keep an image by its address, so one
   * address must never mean two images. SteamGridDB's asset ids are unique by themselves.
   */
  let nextSteamChoiceId = 1
  /** By address: an image measured for the Steam gallery is not downloaded again to show it. */
  const thumbnails = new Map<string, Promise<ServedImage | null>>()

  const clear = (): void => {
    drafts.clear()
    assets.clear()
    steamImages.clear()
    thumbnails.clear()
  }

  const thumbnail = (url: string): Promise<ServedImage | null> => {
    const known = thumbnails.get(url)
    if (known) return known
    const pending = deps.getBytes(url).then((bytes) => {
      const type = bytes && detectImageType(bytes)
      return bytes && type ? { bytes: Buffer.from(bytes), mime: MIME[type] } : null
    })
    thumbnails.set(url, pending)
    return pending
  }

  /**
   * Steam does not report sizes, but its thumbnails keep the proportion of the image
   * (measured on 2026-11-06: 1024×768 has a 451×338 thumbnail). Null: it did not download.
   */
  const fitsBackground = async (url: string): Promise<boolean | null> => {
    const image = await thumbnail(url)
    if (!image) return null
    const size = deps.decode(image.bytes)
    return size !== null && hasExpectedProportion('background', size.width, size.height)
  }

  const keep = (
    gameId: number,
    kind: ArtworkEditKind,
    prepare: () => PreparedArtwork,
    source: Draft['source'],
    sourceUrl: string | null
  ): Result<ArtworkDraftInfo> => {
    // The user may have left the screen while this was downloading.
    if (current !== gameId) return fail('not-found')
    try {
      drafts.set(kind, { prepared: prepare(), source, sourceUrl })
    } catch (error) {
      if (error instanceof ArtworkImportFailure) return fail(error.code)
      throw error
    }
    version += 1
    return { ok: true, data: { version } }
  }

  const download = async (
    gameId: number,
    kind: ArtworkEditKind,
    url: string,
    source: 'igdb' | 'steamgriddb' | 'steam'
  ): Promise<Result<ArtworkDraftInfo>> => {
    const bytes = await deps.getBytes(url)
    if (bytes === null) return fail('download-failed')
    return keep(
      gameId,
      kind,
      () => prepareArtworkBytes(Buffer.from(bytes), kind, deps.decode),
      source,
      url
    )
  }

  return {
    begin(gameId) {
      clear()
      current = gameId
    },

    end() {
      clear()
      current = null
    },

    fromFile(gameId, kind, path) {
      if (!isAbsoluteWindowsPath(path) || !matchesPickKind(path, 'image')) {
        return fail('unsupported-type')
      }
      return keep(gameId, kind, () => prepareArtwork(path, kind, deps.decode), 'user', null)
    },

    async fromIgdb(gameId, kind, igdbGameId) {
      if (!IGDB_KINDS.includes(kind)) return fail('no-image')
      const game = deps.games.getById(gameId)
      if (!game) return fail('not-found')
      let answer: IgdbResult<IgdbGameData | null>
      if (igdbGameId !== null) answer = await deps.igdbGame(igdbGameId)
      else if (game.origin === BuiltinOrigin.steam && game.steamAppId !== null) {
        answer = await deps.igdbSteamGame(game.steamAppId)
      } else return fail('not-found')
      if (!answer.ok) return fail(answer.error)
      if (!answer.data) return fail('not-found')
      const url = igdbArtUrls(answer.data).find(([each]) => each === kind)?.[1] ?? null
      return url === null ? fail('no-image') : download(gameId, kind, url, 'igdb')
    },

    async gridAssets(gameId, kind, gridGameId) {
      if (!isGridKind(kind)) return fail('no-image')
      const key = deps.gridKey()
      if (!key) return fail('not-configured')
      const game = deps.games.getById(gameId)
      if (!game) return fail('not-found')
      let target: SteamGridDbTarget
      if (gridGameId !== null) target = { gameId: gridGameId }
      else if (game.origin === BuiltinOrigin.steam && game.steamAppId !== null) {
        target = { steamAppId: game.steamAppId }
      } else return fail('not-found')
      const result = await listAssets(deps.get, key, target, kind)
      if (!result.ok) return fail(result.error)
      for (const asset of result.data) assets.set(asset.id, { url: asset.url, thumb: asset.thumb })
      return {
        ok: true,
        data: result.data.map(({ id, width, height }) => ({ id, width, height }))
      }
    },

    async fromGrid(gameId, kind, assetId) {
      const asset = assets.get(assetId)
      if (!asset || !isGridKind(kind)) return fail('not-found')
      return download(gameId, kind, asset.url, 'steamgriddb')
    },

    async steamChoices(gameId) {
      const game = deps.games.getById(gameId)
      if (game?.origin !== BuiltinOrigin.steam || game.steamAppId === null) return fail('not-found')
      const result = await fetchAppBackgroundChoices(deps.get, game.steamAppId)
      if (!result.ok) return fail(result.error)
      const fits: (boolean | null)[] = []
      for (let i = 0; i < result.data.length; i += MEASURED_AT_ONCE) {
        const batch = result.data.slice(i, i + MEASURED_AT_ONCE)
        fits.push(...(await Promise.all(batch.map((each) => fitsBackground(each.thumbnail)))))
      }
      // The user may have left the screen while this was on its way.
      if (current !== gameId) return fail('not-found')
      const usable = result.data.filter((_, index) => fits[index] === true)
      // Nothing came down: that says nothing about what Steam has.
      if (usable.length === 0 && fits.includes(null)) return fail('download-failed')
      steamImages.clear()
      const choices = usable.slice(0, MAX_STEAM_CHOICES).map((choice) => {
        const id = nextSteamChoiceId++
        steamImages.set(id, { url: choice.url, thumb: choice.thumbnail })
        return { id, store: choice.store }
      })
      return { ok: true, data: choices }
    },

    async fromSteam(gameId, choiceId) {
      const image = steamImages.get(choiceId)
      if (!image) return fail('not-found')
      return download(gameId, 'background', image.url, 'steam')
    },

    save(gameId, remove) {
      if (current !== gameId || !deps.games.getById(gameId)) return fail('not-found')
      const removing = new Set(remove)
      const at = toUtcIso(deps.clock.now())
      try {
        const written = [...drafts]
          .filter(([kind]) => !removing.has(kind))
          .map(([kind, draft]) => ({
            kind,
            draft,
            file: writeArtwork(deps.cacheDir, gameId, kind, draft.prepared)
          }))
        deps.uow.transaction(() => {
          for (const { kind, draft, file } of written) {
            deps.artwork.save({
              gameId,
              kind,
              localPath: file.localPath,
              source: draft.source,
              sourceUrl: draft.sourceUrl,
              width: file.width,
              height: file.height,
              userSelected: true,
              fetchedAt: at
            })
          }
          for (const kind of removing) deps.artwork.remove(gameId, kind, at)
        })
        // After the commit: a failure above must not lose an image the database still points to.
        for (const kind of removing) removeArtworkFile(deps.cacheDir, gameId, kind)
      } catch (error) {
        deps.onError?.(error)
        return fail('storage-failed')
      }
      clear()
      deps.onLibraryChanged()
      return { ok: true, data: null }
    },

    draftImage(kind) {
      const draft = drafts.get(kind as ArtworkEditKind)
      return draft ? { bytes: draft.prepared.bytes, mime: MIME[draft.prepared.type] } : null
    },

    gridThumbnail(assetId) {
      const asset = assets.get(assetId)
      return asset ? thumbnail(asset.thumb) : Promise.resolve(null)
    },

    steamThumbnail(choiceId) {
      const image = steamImages.get(choiceId)
      return image ? thumbnail(image.thumb) : Promise.resolve(null)
    }
  }
}
