import { z } from 'zod'
import { isSteamAppId, isSteamId64, toUtcIso } from '../../core/domain'
import { NetworkError, type HttpGet } from '../http'
import type { SteamWebError, SteamWebResult } from './steam-web'

const API = 'https://api.steampowered.com/ISteamUserStats'
const KEY = /^[A-Za-z0-9]{16,128}$/

/** One achievement definition, in Portuguese when the game has that translation. */
export interface AchievementDefinition {
  apiName: string
  displayName: string
  /** null for hidden achievements Steam does not describe. */
  description: string | null
  /** Remote icon URL. */
  icon: string | null
}

const schemaSchema = z.object({
  game: z.object({
    availableGameStats: z
      .object({
        achievements: z
          .array(
            z.object({
              name: z.string().min(1),
              displayName: z.string().optional(),
              description: z.string().optional(),
              icon: z.string().optional()
            })
          )
          .optional()
      })
      .optional()
  })
})

/** Definitions; an empty list means the game has no achievements. */
export async function fetchAchievementSchema(
  get: HttpGet,
  key: string,
  appId: number
): Promise<SteamWebResult<AchievementDefinition[]>> {
  if (!KEY.test(key)) return { ok: false, error: 'invalid-key' }
  if (!isSteamAppId(appId)) return { ok: false, error: 'not-found' }
  const response = await request(
    get,
    `${API}/GetSchemaForGame/v2/?key=${key}&appid=${appId}&l=brazilian`
  )
  if (!response.ok) return response
  if (response.status !== 200) return { ok: false, error: statusError(response.status) }
  const parsed = schemaSchema.safeParse(response.json)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  return {
    ok: true,
    data: (parsed.data.game.availableGameStats?.achievements ?? []).map((a) => ({
      apiName: a.name,
      displayName: a.displayName?.trim() || a.name,
      description: a.description?.trim() || null,
      icon: a.icon || null
    }))
  }
}

/** Unlock state of one achievement for the player. */
export interface PlayerAchievement {
  unlocked: boolean
  /** ISO-8601 UTC; null when Steam reports no time. */
  unlockedAt: string | null
}

const playerSchema = z.object({
  playerstats: z.object({
    success: z.boolean().optional(),
    error: z.string().optional(),
    achievements: z
      .array(
        z.object({
          apiname: z.string().min(1),
          achieved: z.number(),
          unlocktime: z.number().optional()
        })
      )
      .optional()
  })
})

/**
 * The player's unlock state. Steam answers with an error body in non-200
 * statuses: "Profile is not public" is reported as a private profile, so
 * nothing is written and no achievement looks locked because of it.
 */
export async function fetchPlayerAchievements(
  get: HttpGet,
  key: string,
  steamId: string,
  appId: number
): Promise<SteamWebResult<Map<string, PlayerAchievement>>> {
  if (!KEY.test(key)) return { ok: false, error: 'invalid-key' }
  if (!isSteamId64(steamId)) return { ok: false, error: 'invalid-steam-id' }
  if (!isSteamAppId(appId)) return { ok: false, error: 'not-found' }
  const response = await request(
    get,
    `${API}/GetPlayerAchievements/v1/?key=${key}&steamid=${steamId}&appid=${appId}`
  )
  if (!response.ok) return response
  const parsed = playerSchema.safeParse(response.json)
  if (parsed.success && /not public/i.test(parsed.data.playerstats.error ?? '')) {
    return { ok: false, error: 'private-profile' }
  }
  if (response.status !== 200) return { ok: false, error: statusError(response.status) }
  if (!parsed.success || parsed.data.playerstats.success === false) {
    return { ok: false, error: 'invalid-response' }
  }
  const achievements = parsed.data.playerstats.achievements
  if (achievements === undefined) return { ok: false, error: 'invalid-response' }
  return {
    ok: true,
    data: new Map(
      achievements.map((a) => [
        a.apiname,
        {
          unlocked: a.achieved === 1,
          unlockedAt:
            a.achieved === 1 && a.unlocktime && a.unlocktime > 0
              ? toUtcIso(new Date(a.unlocktime * 1000))
              : null
        }
      ])
    )
  }
}

const globalSchema = z.object({
  achievementpercentages: z.object({
    achievements: z.array(
      // Measured on 2026-11-04: the percent comes as text ("89.8").
      z.object({ name: z.string().min(1), percent: z.union([z.string(), z.number()]) })
    )
  })
})

/** Global unlock rates; public, no key. Unknown or broken values are simply left out. */
export async function fetchGlobalPercentages(
  get: HttpGet,
  appId: number
): Promise<SteamWebResult<Map<string, number>>> {
  if (!isSteamAppId(appId)) return { ok: false, error: 'not-found' }
  const response = await request(
    get,
    `${API}/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`
  )
  if (!response.ok) return response
  if (response.status !== 200) return { ok: false, error: statusError(response.status) }
  const parsed = globalSchema.safeParse(response.json)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  const percentages = new Map<string, number>()
  for (const entry of parsed.data.achievementpercentages.achievements) {
    const percent = Number(entry.percent)
    if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
      percentages.set(entry.name, percent)
    }
  }
  return { ok: true, data: percentages }
}

const statusError = (status: number): SteamWebError =>
  status === 401 || status === 403 ? 'invalid-key' : status === 404 ? 'not-found' : 'network'

async function request(
  get: HttpGet,
  url: string
): Promise<{ ok: true; status: number; json: unknown } | { ok: false; error: SteamWebError }> {
  try {
    const response = await get(url)
    return { ok: true, status: response.status, json: response.json }
  } catch (error) {
    if (error instanceof NetworkError) return { ok: false, error: 'network' }
    throw error
  }
}
