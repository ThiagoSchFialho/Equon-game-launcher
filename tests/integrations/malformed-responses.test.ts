import { describe, expect, it } from 'vitest'
import { NetworkError, type HttpGet } from '../../src/integrations/http'
import {
  fetchAchievementSchema,
  fetchGlobalPercentages,
  fetchPlayerAchievements
} from '../../src/integrations/steam/steam-achievements'
import {
  fetchAppArtwork,
  fetchAppDetails,
  fetchOwnedGames,
  fetchPlayerSummary
} from '../../src/integrations/steam/steam-web'
import { findBestAsset, searchSteamGridDb } from '../../src/integrations/steamgriddb/assets'
import { testSteamGridDbKey } from '../../src/integrations/steamgriddb/steamgriddb'

const KEY = 'ABCDEF0123456789ABCDEF0123456789'
const STEAM_ID = '76561197960287930'
const APP = 620

/** Every client that reads an outside answer. */
const CLIENTS: [string, (get: HttpGet) => Promise<unknown>][] = [
  ['appdetails', (get) => fetchAppDetails(get, APP)],
  ['app artwork', (get) => fetchAppArtwork(get, APP)],
  ['player summary', (get) => fetchPlayerSummary(get, KEY, STEAM_ID)],
  ['owned games', (get) => fetchOwnedGames(get, KEY, STEAM_ID)],
  ['achievement schema', (get) => fetchAchievementSchema(get, KEY, APP)],
  ['player achievements', (get) => fetchPlayerAchievements(get, KEY, STEAM_ID, APP)],
  ['global percentages', (get) => fetchGlobalPercentages(get, APP)],
  ['SteamGridDB key test', (get) => testSteamGridDbKey(get, KEY)],
  ['SteamGridDB search', (get) => searchSteamGridDb(get, KEY, 'portal')],
  ['SteamGridDB best asset', (get) => findBestAsset(get, KEY, { steamAppId: APP }, 'logo')]
]

/** Broken at every depth the clients look at. */
const BODIES: unknown[] = [
  undefined,
  null,
  0,
  'not json',
  [],
  {},
  { response: null },
  { response: [] },
  { response: { games: 'x' } },
  { response: { games: [null, 1, {}, { appid: 'x' }, { appid: 620, playtime_forever: 'x' }] } },
  { response: { players: [{}] } },
  { game: null },
  { game: { availableGameStats: 'x' } },
  { game: { availableGameStats: { achievements: [null, {}, { name: 5 }] } } },
  { playerstats: [] },
  { playerstats: { achievements: 'x' } },
  { playerstats: { achievements: [{}, { apiname: 'A' }] } },
  { achievementpercentages: null },
  { achievementpercentages: { achievements: [null, {}, { name: 'A' }] } },
  { [APP]: null },
  { [APP]: { success: true } },
  { [APP]: { success: true, data: 'x' } },
  { [APP]: { success: true, data: { name: 5, genres: 'x', developers: 1, ratings: [] } } },
  { success: true },
  { success: true, data: 'x' },
  { success: true, data: [null, {}, { url: 5 }, { id: 'x', name: null }] },
  { success: false, errors: ['x'] }
]
const STATUSES = [200, 204, 301, 400, 401, 403, 404, 429, 500, 503]

describe('malformed answers from outside', () => {
  it.each(CLIENTS)('%s never throws, whatever comes back', async (_, run) => {
    for (const status of STATUSES) {
      for (const json of BODIES) {
        await expect(run(async () => ({ status, json }))).resolves.toBeDefined()
      }
    }
  })

  it.each(CLIENTS)('%s reports a network failure instead of throwing', async (_, run) => {
    await expect(
      run(async () => {
        throw new NetworkError()
      })
    ).resolves.toBeDefined()
  })
})
