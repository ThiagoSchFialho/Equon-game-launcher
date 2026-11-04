import { beforeEach, describe, expect, it } from 'vitest'
import type { HttpGet } from '../../../src/integrations/http'
import {
  createGameRepository,
  createGenreRepository,
  createUnitOfWork,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import { createSteamOnline, type SteamOnline } from '../../../src/main/steam/steam-online'
import { createTestDb } from '../../helpers/db'

const KEY = 'ABCDEF0123456789ABCDEF0123456789'
const STEAM_ID = '76561197960287930'

let db: SqliteDatabase
let responses: Map<string, { status: number; json: unknown }>
let urls: string[]
let credentials: { steamId: string | null; steamKey: string | null; gridKey: string | null }
let changes: number
let online: SteamOnline

const games = (): ReturnType<typeof createGameRepository> => createGameRepository(db)
const answer = (match: string, status: number, json: unknown): void => {
  responses.set(match, { status, json })
}

beforeEach(() => {
  db = createTestDb()
  responses = new Map()
  urls = []
  changes = 0
  credentials = { steamId: STEAM_ID, steamKey: KEY, gridKey: null }
  const get: HttpGet = async (url) => {
    urls.push(url)
    for (const [match, response] of responses) if (url.includes(match)) return response
    return { status: 404, json: undefined }
  }
  online = createSteamOnline({
    games: games(),
    genres: createGenreRepository(db),
    uow: createUnitOfWork(db),
    get,
    credentials: () => credentials,
    clock: { now: () => new Date('2026-11-04T02:00:00Z') },
    wait: async () => {},
    onLibraryChanged: () => changes++
  })
})

describe('steam online: playtime sync', () => {
  it('overwrites the Steam baseline and last played of stored games', async () => {
    const id = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' }).id
    games().setFlags(id, { hidden: true })
    answer('GetOwnedGames', 200, {
      response: {
        games: [
          { appid: 2379780, playtime_forever: 91, rtime_last_played: 1793750400 },
          { appid: 999, playtime_forever: 5 }
        ]
      }
    })
    expect(await online.syncPlaytime()).toMatchObject({ status: 'ok', games: 1 })
    expect(games().getById(id)).toMatchObject({
      playtime: 91,
      timeLastPlayed: '2026-11-04T00:00:00Z',
      hidden: true
    })
    expect(games().findBySteamAppId(999)).toBeNull() // never creates games
    expect(changes).toBe(1)
  })

  it('changes nothing without credentials or when Steam fails', async () => {
    const id = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' }).id
    credentials = { steamId: null, steamKey: KEY, gridKey: null }
    expect(await online.syncPlaytime()).toMatchObject({ status: 'failed', error: 'not-configured' })
    expect(urls).toEqual([])

    credentials = { steamId: STEAM_ID, steamKey: KEY, gridKey: null }
    answer('GetOwnedGames', 200, { response: {} })
    expect(await online.syncPlaytime()).toMatchObject({
      status: 'failed',
      error: 'private-profile'
    })
    expect(online.lastSync()).toMatchObject({ error: 'private-profile' })
    expect(games().getById(id)).toMatchObject({ playtime: 0, timeLastPlayed: null })
  })
})

describe('steam online: metadata', () => {
  it('fetches only games without metadata and retries failures later', async () => {
    const balatro = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' }).id
    const broken = games().upsertSteamGame({ steamAppId: 730, title: 'Counter-Strike 2' }).id
    const done = games().upsertSteamGame({
      steamAppId: 620,
      title: 'Portal 2',
      metadataFetchedAt: '2026-11-01T00:00:00Z'
    }).id
    games().setFlags(balatro, { beated: true })
    answer('appids=2379780', 200, {
      '2379780': {
        success: true,
        data: {
          short_description: 'O pôquer roguelike.',
          developers: ['LocalThunk'],
          required_age: 0,
          genres: [{ description: 'Casual' }, { description: 'Indie' }]
        }
      }
    })
    answer('appids=730', 503, null)

    await online.fetchMissingMetadata()

    expect(games().getById(balatro)).toMatchObject({
      title: 'Balatro',
      description: 'O pôquer roguelike.',
      developer: 'LocalThunk',
      requiredAge: null,
      beated: true,
      metadataFetchedAt: '2026-11-04T02:00:00Z'
    })
    expect(
      createGenreRepository(db)
        .listForGame(balatro)
        .map((g) => g.name)
    ).toEqual(['Casual', 'Indie'])
    expect(games().getById(broken)?.metadataFetchedAt).toBeNull()
    expect(urls.some((u) => u.includes('appids=620'))).toBe(false)
    expect(done).toBeGreaterThan(0)

    urls = []
    await online.fetchMissingMetadata()
    expect(urls).toEqual([expect.stringContaining('appids=730')])
  })
})

describe('steam online: connection tests', () => {
  it('tests Steam with the stored credentials and reports what is missing', async () => {
    answer('GetPlayerSummaries', 200, {
      response: {
        players: [{ steamid: STEAM_ID, personaname: 'Jogador', communityvisibilitystate: 3 }]
      }
    })
    expect(await online.testConnection('steam')).toEqual({
      ok: true,
      data: { personaName: 'Jogador', gamesVisible: true }
    })
    expect(await online.testConnection('steamgriddb')).toEqual({
      ok: false,
      error: { code: 'not-configured' }
    })
    credentials = { steamId: STEAM_ID, steamKey: KEY, gridKey: KEY }
    answer('steamgriddb.com', 401, { success: false })
    expect(await online.testConnection('steamgriddb')).toEqual({
      ok: false,
      error: { code: 'invalid-key' }
    })
  })
})
