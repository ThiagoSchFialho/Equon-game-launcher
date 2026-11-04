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
const STARTUP = { updatePlaytime: true, scanComplete: true }
const BUTTON = { updatePlaytime: false, scanComplete: true }

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
    await online.syncOwnedGames(STARTUP)
    expect(online.lastSync()).toMatchObject({ status: 'ok', games: 1 })
    expect(games().getById(id)).toMatchObject({
      playtime: 91,
      timeLastPlayed: '2026-11-04T00:00:00Z',
      hidden: true
    })
    expect(games().findBySteamAppId(999)).toBeNull() // no name: cannot be added
    expect(changes).toBe(1)
  })

  it('changes nothing without credentials or when Steam fails', async () => {
    const id = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' }).id
    credentials = { steamId: null, steamKey: KEY, gridKey: null }
    expect(await online.syncOwnedGames(STARTUP)).toMatchObject({
      error: 'not-configured',
      added: 0
    })
    expect(online.lastSync()).toMatchObject({ status: 'failed', error: 'not-configured' })
    expect(urls).toEqual([])

    credentials = { steamId: STEAM_ID, steamKey: KEY, gridKey: null }
    answer('GetOwnedGames', 200, { response: {} })
    expect(await online.syncOwnedGames(STARTUP)).toMatchObject({ error: 'private-profile' })
    expect(online.lastSync()).toMatchObject({ error: 'private-profile' })
    expect(games().getById(id)).toMatchObject({ playtime: 0, timeLastPlayed: null })
  })
})

describe('steam online: owned games', () => {
  const OWNED = {
    response: {
      games: [
        { appid: 620, name: 'Portal 2', playtime_forever: 90, rtime_last_played: 1793750400 },
        { appid: 730, name: 'Counter-Strike 2', playtime_forever: 500 }
      ]
    }
  }

  it('adds owned games as not installed, with Steam play stats, and is idempotent', async () => {
    answer('GetOwnedGames', 200, OWNED)
    expect(await online.syncOwnedGames(BUTTON)).toMatchObject({ added: 2, error: null })
    expect(games().findBySteamAppId(620)).toMatchObject({
      title: 'Portal 2',
      origin: 'steam',
      installed: false,
      hidden: false,
      playtime: 90,
      timeLastPlayed: '2026-11-04T00:00:00Z'
    })
    expect(changes).toBe(1)

    const before = games().list()
    expect(await online.syncOwnedGames(BUTTON)).toMatchObject({ added: 0, error: null })
    expect(games().list()).toEqual(before)
    expect(changes).toBe(1)
  })

  it('never writes "not installed" when the local scan was not complete', async () => {
    answer('GetOwnedGames', 200, OWNED)
    await online.syncOwnedGames({ updatePlaytime: false, scanComplete: false })
    expect(games().findBySteamAppId(620)?.installed).toBeNull()
  })

  it('the button leaves synced games alone; only startup overwrites their play stats', async () => {
    const id = games().upsertSteamGame({ steamAppId: 620, title: 'Portal 2' }).id
    games().setInstalled(id, true)
    games().setFlags(id, { hidden: true, beated: true })
    answer('GetOwnedGames', 200, {
      response: { games: [{ appid: 620, name: 'Portal 2', playtime_forever: 90 }] }
    })
    await online.syncOwnedGames(STARTUP)
    expect(games().getById(id)).toMatchObject({ playtime: 90, installed: true, hidden: true })

    answer('GetOwnedGames', 200, {
      response: { games: [{ appid: 620, name: 'Renamed', playtime_forever: 200 }] }
    })
    await online.syncOwnedGames(BUTTON)
    expect(games().getById(id)).toMatchObject({
      title: 'Portal 2',
      playtime: 90,
      installed: true,
      hidden: true,
      beated: true
    })
    await online.syncOwnedGames(STARTUP)
    expect(games().getById(id)).toMatchObject({ playtime: 200, installed: true })
  })

  it('a game found by the local scan gets its first baseline from the button', async () => {
    const id = games().upsertSteamGame({ steamAppId: 620, title: 'Portal 2' }).id
    answer('GetOwnedGames', 200, OWNED)
    await online.syncOwnedGames(BUTTON)
    expect(games().getById(id)).toMatchObject({ playtime: 90 })
  })

  it('reports a game that matches a manual one for review, without merging', async () => {
    const manual = games().create({ origin: 'manual', title: 'Portal 2' }).id
    answer('GetOwnedGames', 200, OWNED)
    const outcome = await online.syncOwnedGames(BUTTON)
    expect(outcome.duplicates).toMatchObject([
      { existingGameId: manual, discovered: { externalId: '620' } }
    ])
    expect(games().list()).toHaveLength(3)
  })

  it('a failed button press changes nothing and keeps the startup sync info', async () => {
    answer('GetOwnedGames', 200, OWNED)
    await online.syncOwnedGames(STARTUP)
    const info = online.lastSync()
    const before = games().list()
    answer('GetOwnedGames', 200, { response: {} })
    expect(await online.syncOwnedGames(BUTTON)).toEqual({
      added: 0,
      duplicates: [],
      error: 'private-profile'
    })
    expect(online.lastSync()).toEqual(info)
    expect(games().list()).toEqual(before)
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
          genres: [{ description: 'Casual' }, { description: 'Indie' }],
          release_date: { coming_soon: false, date: '20/fev./2024' }
        }
      }
    })
    answer('appids=730', 503, null)

    await online.fetchMissingMetadata()

    expect(games().getById(balatro)).toMatchObject({
      title: 'Balatro',
      description: 'O pôquer roguelike.',
      developer: 'LocalThunk',
      releaseDate: '2024-02-20',
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
