import { describe, expect, it } from 'vitest'
import { NetworkError, type HttpGet } from '../../src/integrations/http'
import {
  fetchAppDetails,
  fetchOwnedGames,
  fetchPlayerSummary,
  parseStoreDate
} from '../../src/integrations/steam/steam-web'
import { testSteamGridDbKey } from '../../src/integrations/steamgriddb/steamgriddb'

const KEY = 'ABCDEF0123456789ABCDEF0123456789'
const STEAM_ID = '76561197960287930'

/** Answers every request with one fixture and records the URLs and headers. */
function fake(status: number, json: unknown): HttpGet & { calls: [string, unknown][] } {
  const calls: [string, unknown][] = []
  const get = (async (url: string, headers?: Record<string, string>) => {
    calls.push([url, headers])
    return { status, json }
  }) as HttpGet & { calls: [string, unknown][] }
  get.calls = calls
  return get
}
const offline: HttpGet = async () => {
  throw new NetworkError()
}

// Trimmed from a real appdetails response (Balatro, l=brazilian).
const BALATRO = {
  '2379780': {
    success: true,
    data: {
      type: 'game',
      name: 'Balatro',
      required_age: 0,
      ratings: { dejus: { rating: 'l', required_age: '0' }, pegi: { rating: '3' } },
      short_description: 'O pôquer roguelike. Balatro &quot;hipnoticamente&quot;  satisfatório.',
      developers: ['LocalThunk'],
      genres: [
        { id: '4', description: 'Casual' },
        { id: '23', description: 'Indie' }
      ],
      release_date: { coming_soon: false, date: '20/fev./2024' }
    }
  }
}

describe('fetchAppDetails', () => {
  it('maps the chosen fields in Portuguese', async () => {
    const get = fake(200, BALATRO)
    expect(await fetchAppDetails(get, 2379780)).toEqual({
      ok: true,
      data: {
        description: 'O pôquer roguelike. Balatro "hipnoticamente" satisfatório.',
        developer: 'LocalThunk',
        requiredAge: 'L',
        genres: ['Casual', 'Indie'],
        releaseDate: '2024-02-20'
      }
    })
    expect(get.calls[0][0]).toBe(
      'https://store.steampowered.com/api/appdetails?appids=2379780&l=brazilian&cc=br'
    )
  })

  it('uses the DEJUS rating only, and treats missing fields as unknown', async () => {
    const rated = (ratings: unknown): HttpGet =>
      fake(200, { '1': { success: true, data: { required_age: '18', ratings } } })
    expect(await fetchAppDetails(rated({ dejus: { rating: '16' } }), 1)).toEqual({
      ok: true,
      data: { description: null, developer: null, requiredAge: '16', genres: [], releaseDate: null }
    })
    // required_age and other systems are ignored; unknown DEJUS values are pendente.
    expect(await fetchAppDetails(rated({ pegi: { rating: '18' } }), 1)).toMatchObject({
      data: { requiredAge: null }
    })
    expect(await fetchAppDetails(rated({ dejus: { rating: 'ER' } }), 1)).toMatchObject({
      data: { requiredAge: null }
    })
    expect(await fetchAppDetails(rated({ dejus: {} }), 1)).toMatchObject({
      data: { requiredAge: null }
    })
    expect(await fetchAppDetails(rated(null), 1)).toMatchObject({ ok: true })
  })

  it('reports unknown apps, bad bodies, HTTP errors and network failures', async () => {
    expect(await fetchAppDetails(fake(200, { '228980': { success: false } }), 228980)).toEqual({
      ok: false,
      error: 'not-found'
    })
    expect(await fetchAppDetails(fake(200, { other: 1 }), 5)).toEqual({
      ok: false,
      error: 'invalid-response'
    })
    expect(await fetchAppDetails(fake(429, null), 5)).toEqual({ ok: false, error: 'network' })
    expect(await fetchAppDetails(offline, 5)).toEqual({ ok: false, error: 'network' })
  })
})

describe('parseStoreDate', () => {
  it.each([
    ['20/fev./2024', '2024-02-20'],
    ['6/mar./2025', '2025-03-06'],
    ['30/nov./2010', '2010-11-30'],
    ['1/mai/2026', '2026-05-01'],
    ['31/fev./2024', null],
    ['', null],
    ['Em breve', null],
    ['2026', null],
    ['T1 de 2026', null],
    [undefined, null]
  ])('%s → %s', (text, expected) => {
    expect(parseStoreDate(text)).toBe(expected)
  })
})

describe('fetchOwnedGames', () => {
  it('maps minutes and the last played time', async () => {
    const get = fake(200, {
      response: {
        game_count: 2,
        games: [
          { appid: 2379780, playtime_forever: 91, rtime_last_played: 1793750400 },
          { appid: 730, playtime_forever: 614, rtime_last_played: 0 }
        ]
      }
    })
    expect(await fetchOwnedGames(get, KEY, STEAM_ID)).toEqual({
      ok: true,
      data: [
        { appId: 2379780, playtimeMinutes: 91, lastPlayed: '2026-11-04T00:00:00Z' },
        { appId: 730, playtimeMinutes: 614, lastPlayed: null }
      ]
    })
    expect(get.calls[0][0]).toContain('/IPlayerService/GetOwnedGames/v1/?key=')
  })

  it('treats an empty response (private profile) and bad keys as failures', async () => {
    expect(await fetchOwnedGames(fake(200, { response: {} }), KEY, STEAM_ID)).toEqual({
      ok: false,
      error: 'private-profile'
    })
    expect(await fetchOwnedGames(fake(403, null), KEY, STEAM_ID)).toEqual({
      ok: false,
      error: 'invalid-key'
    })
    expect(await fetchOwnedGames(fake(200, {}), KEY, 'bad')).toEqual({
      ok: false,
      error: 'invalid-steam-id'
    })
    expect(await fetchOwnedGames(offline, KEY, STEAM_ID)).toEqual({ ok: false, error: 'network' })
  })
})

describe('fetchPlayerSummary', () => {
  const player = (visibility: number): unknown => ({
    response: {
      players: [{ steamid: STEAM_ID, personaname: 'Jogador', communityvisibilitystate: visibility }]
    }
  })

  it('returns the profile name and whether game details are visible', async () => {
    expect(await fetchPlayerSummary(fake(200, player(3)), KEY, STEAM_ID)).toEqual({
      ok: true,
      data: { personaName: 'Jogador', gamesVisible: true }
    })
    expect(await fetchPlayerSummary(fake(200, player(1)), KEY, STEAM_ID)).toMatchObject({
      ok: true,
      data: { gamesVisible: false }
    })
  })

  it('reports an unknown SteamID', async () => {
    expect(
      await fetchPlayerSummary(fake(200, { response: { players: [] } }), KEY, STEAM_ID)
    ).toEqual({ ok: false, error: 'invalid-steam-id' })
  })
})

describe('testSteamGridDbKey', () => {
  it('sends the key in the Authorization header, never in the URL', async () => {
    const get = fake(200, { success: true, data: {} })
    expect(await testSteamGridDbKey(get, KEY)).toBe('ok')
    expect(get.calls[0][0]).not.toContain(KEY)
    expect(get.calls[0][1]).toEqual({ Authorization: `Bearer ${KEY}` })
  })

  it('reports invalid keys and failures', async () => {
    expect(await testSteamGridDbKey(fake(401, { success: false }), KEY)).toBe('invalid-key')
    expect(await testSteamGridDbKey(fake(500, null), KEY)).toBe('network')
    expect(await testSteamGridDbKey(offline, KEY)).toBe('network')
    expect(await testSteamGridDbKey(fake(200, {}), 'short')).toBe('invalid-key')
  })
})
