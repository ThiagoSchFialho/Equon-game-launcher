import { z } from 'zod'
import { NetworkError, isAllowedImageUrl, type HttpGet } from '../http'

const API = 'https://www.steamgriddb.com/api/v2'

/** Kinds SteamGridDB provides (ARCHITECTURE.md §3.13). */
export type SteamGridDbKind = 'cover_square' | 'cover_portrait' | 'logo' | 'header'

/** Grid dimensions per kind; logos have no dimension filter. */
const GRID_DIMENSIONS: Record<Exclude<SteamGridDbKind, 'logo'>, string> = {
  cover_square: '512x512,1024x1024',
  cover_portrait: '600x900',
  header: '460x215,920x430'
}

export type SteamGridDbError =
  'invalid-key' | 'network' | 'unavailable' | 'invalid-response' | 'not-found'
export type SteamGridDbResult<T> = { ok: true; data: T } | { ok: false; error: SteamGridDbError }

/** A game on SteamGridDB, for the manual-game search. */
export interface SteamGridDbGame {
  id: number
  name: string
  /** Release year, when known. */
  year: number | null
}

/** Steam games are looked up by App ID; manual games by the SteamGridDB game chosen by the user. */
export type SteamGridDbTarget = { steamAppId: number } | { gameId: number }

const assetsSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      url: z.string(),
      score: z.number().optional(),
      nsfw: z.boolean().optional(),
      humor: z.boolean().optional()
    })
  )
})

const searchSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      release_date: z.number().nullish()
    })
  )
})

async function call(get: HttpGet, key: string, path: string): Promise<SteamGridDbResult<unknown>> {
  try {
    const response = await get(`${API}${path}`, { Authorization: `Bearer ${key}` })
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'invalid-key' }
    }
    if (response.status === 404) return { ok: false, error: 'not-found' }
    if (response.status !== 200) return { ok: false, error: 'unavailable' }
    return { ok: true, data: response.json }
  } catch (error) {
    if (error instanceof NetworkError) return { ok: false, error: 'network' }
    throw error
  }
}

const targetPath = (target: SteamGridDbTarget): string =>
  'steamAppId' in target ? `steam/${target.steamAppId}` : `game/${target.gameId}`

const assetsPath = (target: SteamGridDbTarget, kind: SteamGridDbKind): string => {
  const query = 'types=static&nsfw=false&humor=false'
  return kind === 'logo'
    ? `/logos/${targetPath(target)}?${query}`
    : `/grids/${targetPath(target)}?dimensions=${GRID_DIMENSIONS[kind]}&${query}`
}

/**
 * URL of the best-voted static image of one kind (owner decision: highest
 * score), skipping adult and joke entries; null when SteamGridDB has none.
 */
export async function findBestAsset(
  get: HttpGet,
  key: string,
  target: SteamGridDbTarget,
  kind: SteamGridDbKind
): Promise<SteamGridDbResult<string | null>> {
  const result = await call(get, key, assetsPath(target, kind))
  if (!result.ok) return result.error === 'not-found' ? { ok: true, data: null } : result
  const parsed = assetsSchema.safeParse(result.data)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  const best = parsed.data.data
    .filter((asset) => !asset.nsfw && !asset.humor)
    .reduce<{ url: string; score: number } | null>((top, asset) => {
      const score = asset.score ?? 0
      return top === null || score > top.score ? { url: asset.url, score } : top
    }, null)
  return { ok: true, data: best?.url ?? null }
}

export interface SteamGridDbAsset {
  id: number
  url: string
  thumb: string
  width: number
  height: number
}

/** How many images one gallery shows. */
const MAX_LISTED_ASSETS = 40

const listedAssetSchema = z.object({
  id: z.number().int().positive(),
  url: z.string(),
  thumb: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  score: z.number().optional(),
  nsfw: z.boolean().optional(),
  humor: z.boolean().optional()
})
const assetListSchema = z.object({ success: z.literal(true), data: z.array(z.unknown()) })

/** Static images of one kind for the user to choose from, best voted first. */
export async function listAssets(
  get: HttpGet,
  key: string,
  target: SteamGridDbTarget,
  kind: SteamGridDbKind
): Promise<SteamGridDbResult<SteamGridDbAsset[]>> {
  const result = await call(get, key, assetsPath(target, kind))
  if (!result.ok) return result.error === 'not-found' ? { ok: true, data: [] } : result
  const parsed = assetListSchema.safeParse(result.data)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  return {
    ok: true,
    data: parsed.data.data
      // One broken entry does not cost the rest of the list.
      .flatMap((entry) => {
        const asset = listedAssetSchema.safeParse(entry)
        return asset.success ? [asset.data] : []
      })
      .filter(
        (asset) =>
          !asset.nsfw &&
          !asset.humor &&
          isAllowedImageUrl(asset.url) &&
          isAllowedImageUrl(asset.thumb)
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, MAX_LISTED_ASSETS)
      .map(({ id, url, thumb, width, height }) => ({ id, url, thumb, width, height }))
  }
}

/** Name search for manual games (the user confirms the match). */
export async function searchSteamGridDb(
  get: HttpGet,
  key: string,
  term: string
): Promise<SteamGridDbResult<SteamGridDbGame[]>> {
  const clean = term.trim()
  if (clean === '') return { ok: true, data: [] }
  const result = await call(get, key, `/search/autocomplete/${encodeURIComponent(clean)}`)
  if (!result.ok) return result.error === 'not-found' ? { ok: true, data: [] } : result
  const parsed = searchSchema.safeParse(result.data)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  return {
    ok: true,
    data: parsed.data.data.slice(0, 20).map((game) => ({
      id: game.id,
      name: game.name,
      year: game.release_date ? new Date(game.release_date * 1000).getUTCFullYear() : null
    }))
  }
}
