import { z } from 'zod'
import { isSteamAppId, isSteamId64, toUtcIso } from '../../core/domain'
import { NetworkError, type HttpGet } from '../http'

/** Why a Steam request produced nothing usable; nothing is written then. */
export type SteamWebError =
  | 'invalid-key'
  | 'invalid-steam-id'
  | 'private-profile'
  | 'network'
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
        genres: z.array(z.object({ description: z.string() })).optional()
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
  if (response.status !== 200) return { ok: false, error: 'network' }
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
      genres: (data.genres ?? []).map((g) => clean(g.description)).filter((g) => g !== null)
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
    `${WEB_API}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_played_free_games=1`
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
