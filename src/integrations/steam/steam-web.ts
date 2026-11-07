import { z } from 'zod'
import { isSteamAppId, isSteamId64, toUtcIso } from '../../core/domain'
import { NetworkError, type HttpGet } from '../http'

/** Why a Steam request produced nothing usable; nothing is written then. */
export type SteamWebError =
  | 'invalid-key'
  | 'invalid-steam-id'
  | 'private-profile'
  | 'network'
  /** The store answered, but could not serve: rate limit or outage. */
  | 'unavailable'
  | 'invalid-response'
  | 'not-found'

export type SteamWebResult<T> = { ok: true; data: T } | { ok: false; error: SteamWebError }

const STORE = 'https://store.steampowered.com/api/appdetails'
const WEB_API = 'https://api.steampowered.com'

// ---------------------------------------------------------------- appdetails

/** Fields the owner chose for the game page (Phase 6b); everything else is ignored. */
export interface AppDetails {
  description: string | null
  developer: string | null
  /** Brazilian rating (DEJUS): L, 10, 12, 14, 16 or 18; null when absent or unknown. */
  requiredAge: string | null
  genres: string[]
  /** YYYY-MM-DD; null when Steam has no exact date (e.g. "Em breve"). */
  releaseDate: string | null
}

const appDetailsSchema = z.record(
  z.string(),
  z.union([
    z.object({
      success: z.literal(true),
      data: z.object({
        short_description: z.string().optional(),
        developers: z.array(z.string()).optional(),
        ratings: z
          .object({ dejus: z.object({ rating: z.string().optional() }).optional() })
          .nullish(),
        genres: z.array(z.object({ description: z.string() })).optional(),
        release_date: z.object({ date: z.string().optional() }).nullish()
      })
    }),
    z.object({ success: z.literal(false) })
  ])
)

/** Steam returns some text with HTML entities; decode the common ones. */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** DEJUS ratings shown by the age badges (owner decision); anything else is pendente. */
const DEJUS = new Set(['L', '10', '12', '14', '16', '18'])

function dejusRating(rating: string | undefined): string | null {
  const value = rating?.trim().toUpperCase() ?? ''
  return DEJUS.has(value) ? value : null
}

const PT_MONTHS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez'
]

/**
 * Parses the Portuguese store date ("20/fev./2024", "6/mar./2025") into
 * YYYY-MM-DD. Anything else ("Em breve", a year or quarter only, an empty
 * string) is unknown: null.
 */
export function parseStoreDate(text: string | undefined): string | null {
  const match = /^(\d{1,2})\/([a-zç]{3})\.?\/(\d{4})$/i.exec(text?.trim() ?? '')
  if (!match) return null
  const month = PT_MONTHS.indexOf(match[2].toLowerCase()) + 1
  const day = Number(match[1])
  const year = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (month === 0 || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const clean = (text: string | undefined): string | null => {
  const value = text === undefined ? '' : decodeEntities(text).replace(/\s+/g, ' ').trim()
  return value === '' ? null : value
}

/** Store metadata in Portuguese (`l=brazilian`); public endpoint, no key. */
export async function fetchAppDetails(
  get: HttpGet,
  appId: number
): Promise<SteamWebResult<AppDetails>> {
  if (!isSteamAppId(appId)) return { ok: false, error: 'not-found' }
  let response
  try {
    response = await get(`${STORE}?appids=${appId}&l=brazilian&cc=br`)
  } catch (error) {
    if (error instanceof NetworkError) return { ok: false, error: 'network' }
    throw error
  }
  if (response.status !== 200) return { ok: false, error: 'unavailable' }
  const parsed = appDetailsSchema.safeParse(response.json)
  const entry = parsed.success ? parsed.data[String(appId)] : undefined
  if (!entry) return { ok: false, error: 'invalid-response' }
  if (!entry.success) return { ok: false, error: 'not-found' }
  const data = entry.data
  return {
    ok: true,
    data: {
      description: clean(data.short_description),
      developer: clean(data.developers?.[0]),
      requiredAge: dejusRating(data.ratings?.dejus?.rating),
      genres: (data.genres ?? []).map((g) => clean(g.description)).filter((g) => g !== null),
      releaseDate: parseStoreDate(data.release_date?.date)
    }
  }
}

// ----------------------------------------------------------------- Web API

const KEY = /^[A-Za-z0-9]{16,128}$/

const playerSummariesSchema = z.object({
  response: z.object({
    players: z.array(
      z.object({
        steamid: z.string(),
        personaname: z.string(),
        communityvisibilitystate: z.number()
      })
    )
  })
})

/**
 * Checks the key and the SteamID together (Settings › "Testar conexão").
 * `gamesVisible` is false when the profile is not public, which blocks the
 * playtime sync.
 */
export async function fetchPlayerSummary(
  get: HttpGet,
  key: string,
  steamId: string
): Promise<SteamWebResult<{ personaName: string; gamesVisible: boolean }>> {
  if (!KEY.test(key)) return { ok: false, error: 'invalid-key' }
  if (!isSteamId64(steamId)) return { ok: false, error: 'invalid-steam-id' }
  const response = await request(
    get,
    `${WEB_API}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`
  )
  if (!response.ok) return response
  const parsed = playerSummariesSchema.safeParse(response.data)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  const player = parsed.data.response.players.find((p) => p.steamid === steamId)
  if (!player) return { ok: false, error: 'invalid-steam-id' }
  // 3 = public; anything else hides the game details.
  return {
    ok: true,
    data: { personaName: player.personaname, gamesVisible: player.communityvisibilitystate === 3 }
  }
}

export interface OwnedGame {
  appId: number
  /** null when Steam sends no name: such a game cannot be added to the library. */
  title: string | null
  /** playtime_forever, minutes. */
  playtimeMinutes: number
  /** rtime_last_played as ISO-8601 UTC; null when 0 or absent. */
  lastPlayed: string | null
}

const ownedGamesSchema = z.object({
  response: z.object({
    game_count: z.number().optional(),
    games: z
      .array(
        z.object({
          appid: z.number(),
          name: z.string().optional(),
          playtime_forever: z.number(),
          rtime_last_played: z.number().optional()
        })
      )
      .optional()
  })
})

/**
 * IPlayerService/GetOwnedGames v1 (DATA_BASE_CONTEXT.md §3.11). A private
 * profile answers with an empty `response`: that is reported as an error, so
 * the sync changes nothing.
 */
export async function fetchOwnedGames(
  get: HttpGet,
  key: string,
  steamId: string
): Promise<SteamWebResult<OwnedGame[]>> {
  if (!KEY.test(key)) return { ok: false, error: 'invalid-key' }
  if (!isSteamId64(steamId)) return { ok: false, error: 'invalid-steam-id' }
  const response = await request(
    get,
    `${WEB_API}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`
  )
  if (!response.ok) return response
  const parsed = ownedGamesSchema.safeParse(response.data)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  const { games, game_count } = parsed.data.response
  if (games === undefined) {
    return { ok: false, error: game_count === 0 ? 'invalid-response' : 'private-profile' }
  }
  return {
    ok: true,
    data: games
      .filter((g) => isSteamAppId(g.appid) && Number.isFinite(g.playtime_forever))
      .map((g) => ({
        appId: g.appid,
        title: g.name?.trim() || null,
        playtimeMinutes: Math.max(0, Math.floor(g.playtime_forever)),
        lastPlayed:
          g.rtime_last_played && g.rtime_last_played > 0
            ? toUtcIso(new Date(g.rtime_last_played * 1000))
            : null
      }))
  }
}

/** One Web API GET: 401/403 = bad key, other non-200 = unavailable. */
async function request(get: HttpGet, url: string): Promise<SteamWebResult<unknown>> {
  try {
    const response = await get(url)
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'invalid-key' }
    }
    if (response.status !== 200) return { ok: false, error: 'network' }
    return { ok: true, data: response.json }
  } catch (error) {
    if (error instanceof NetworkError) return { ok: false, error: 'network' }
    throw error
  }
}

// ------------------------------------------------------------ store artwork

const appArtworkSchema = z.record(
  z.string(),
  z.union([
    z.object({
      success: z.literal(true),
      data: z.object({
        header_image: z.string().optional(),
        background_raw: z.string().optional(),
        screenshots: z
          .array(z.object({ path_full: z.string(), path_thumbnail: z.string().optional() }))
          .optional()
      })
    }),
    z.object({ success: z.literal(false) })
  ])
)

type AppArtworkData = Extract<z.infer<typeof appArtworkSchema>[string], { success: true }>['data']

async function requestAppArtwork(
  get: HttpGet,
  appId: number
): Promise<SteamWebResult<AppArtworkData>> {
  if (!isSteamAppId(appId)) return { ok: false, error: 'not-found' }
  let response
  try {
    response = await get(`${STORE}?appids=${appId}&filters=basic,background,screenshots`)
  } catch (error) {
    if (error instanceof NetworkError) return { ok: false, error: 'network' }
    throw error
  }
  if (response.status !== 200) return { ok: false, error: 'unavailable' }
  const parsed = appArtworkSchema.safeParse(response.json)
  const entry = parsed.success ? parsed.data[String(appId)] : undefined
  if (!entry) return { ok: false, error: 'invalid-response' }
  return entry.success ? { ok: true, data: entry.data } : { ok: false, error: 'not-found' }
}

const ownBackground = (data: AppArtworkData): string | null =>
  data.background_raw && !isGeneratedStoreBackground(data.background_raw)
    ? data.background_raw
    : null

/**
 * Store artwork URLs (owner decisions, Phase 6c): `header_image` for the
 * Achievements screen and `background_raw` as the game page background; when
 * the store only has a generated, blurred background, the first screenshot.
 */
export async function fetchAppArtwork(
  get: HttpGet,
  appId: number
): Promise<SteamWebResult<{ header: string | null; background: string | null }>> {
  const result = await requestAppArtwork(get, appId)
  if (!result.ok) return result
  return {
    ok: true,
    data: {
      header: result.data.header_image || null,
      background: ownBackground(result.data) ?? result.data.screenshots?.[0]?.path_full ?? null
    }
  }
}

export interface AppBackgroundChoice {
  url: string
  thumbnail: string
  /** The store's own background, not a screenshot. */
  store: boolean
}

/** What "Editar artes" offers for a background: the store's own one first, then the screenshots. */
export async function fetchAppBackgroundChoices(
  get: HttpGet,
  appId: number
): Promise<SteamWebResult<AppBackgroundChoice[]>> {
  const result = await requestAppArtwork(get, appId)
  if (!result.ok) return result
  const store = ownBackground(result.data)
  return {
    ok: true,
    data: [
      ...(store ? [{ url: store, thumbnail: store, store: true }] : []),
      ...(result.data.screenshots ?? []).map((shot) => ({
        url: shot.path_full,
        thumbnail: shot.path_thumbnail ?? shot.path_full,
        store: false
      }))
    ]
  }
}

/**
 * Games without their own store background get one generated by the store
 * (blurred, darkened), served from /images/storepagebackground/.
 */
export function isGeneratedStoreBackground(url: string): boolean {
  return url.includes('/images/storepagebackground/')
}
