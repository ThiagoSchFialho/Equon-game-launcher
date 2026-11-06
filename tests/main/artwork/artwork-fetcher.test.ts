import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NetworkError, type HttpGet, type HttpGetBytes } from '../../../src/integrations/http'
import type { IgdbGameData } from '../../../src/integrations/igdb/games'
import type { IgdbResult } from '../../../src/integrations/igdb/igdb'
import {
  createArtworkRepository,
  createGameRepository,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import {
  createArtworkFetcher,
  type ArtworkFetcher
} from '../../../src/main/artwork/artwork-fetcher'
import { UNAVAILABLE_LIMIT, UNAVAILABLE_WAIT_MS } from '../../../src/main/queue-pacing'
import { createTestDb } from '../../helpers/db'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const KEY = 'ABCDEF0123456789ABCDEF0123456789'

let dir: string
let db: SqliteDatabase
let json: Map<string, { status: number; json: unknown }>
let images: Map<string, { bytes: Uint8Array; size: [number, number] }>
let requested: string[]
let gridKey: string | null
let igdbAnswer: IgdbResult<IgdbGameData | null>
let igdbOn: boolean
let igdbAsked: number[]
let fetcher: ArtworkFetcher
let progress: ({ done: number; total: number } | null)[]
let waits: number[]

const games = (): ReturnType<typeof createGameRepository> => createGameRepository(db)
const artwork = (): ReturnType<typeof createArtworkRepository> => createArtworkRepository(db)
const image = (url: string, width: number, height: number): void => {
  // Distinct bytes per URL so the fake decoder can tell them apart.
  images.set(url, { bytes: Buffer.concat([PNG, Buffer.from(url)]), size: [width, height] })
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'equon-art-'))
  db = createTestDb()
  json = new Map()
  images = new Map()
  requested = []
  gridKey = null
  igdbAnswer = { ok: true, data: null }
  igdbOn = false
  igdbAsked = []
  progress = []
  waits = []
  const get: HttpGet = async (url) => {
    requested.push(url)
    for (const [match, response] of json) if (url.includes(match)) return response
    return { status: 404, json: undefined }
  }
  const getBytes: HttpGetBytes = async (url) => images.get(url)?.bytes ?? null
  fetcher = createArtworkFetcher({
    games: games(),
    artwork: artwork(),
    get,
    getBytes,
    gridKey: () => gridKey,
    igdbConfigured: () => igdbOn,
    igdbGame: async () => igdbAnswer,
    igdbSteamGame: async (appId) => {
      igdbAsked.push(appId)
      return igdbAnswer
    },
    cacheDir: dir,
    decode: (bytes) => {
      for (const entry of images.values()) {
        if (Buffer.compare(entry.bytes, bytes) === 0) {
          return { width: entry.size[0], height: entry.size[1] }
        }
      }
      return null
    },
    clock: { now: () => new Date('2026-11-04T03:00:00Z') },
    wait: async (ms) => {
      waits.push(ms)
    },
    onLibraryChanged: () => {},
    onProgress: (value) => progress.push(value)
  })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const steamArt = (appId: number, header: string, background: string): void => {
  json.set(`appids=${appId}&filters=basic,background`, {
    status: 200,
    json: { [appId]: { success: true, data: { header_image: header, background_raw: background } } }
  })
}

describe('artwork fetcher: Steam games', () => {
  it('stores header_image and background_raw without a SteamGridDB key', async () => {
    const id = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' }).id
    steamArt(2379780, 'https://x.steamstatic.com/h.jpg', 'https://x.steamstatic.com/bg.jpg')
    image('https://x.steamstatic.com/h.jpg', 460, 215)
    image('https://x.steamstatic.com/bg.jpg', 1438, 810)

    await fetcher.fetchMissing()

    expect(artwork().get(id, 'header')).toMatchObject({ source: 'steam', userSelected: false })
    expect(artwork().get(id, 'background')).toMatchObject({ width: 1438, height: 810 })
    expect(requested.some((u) => u.includes('steamgriddb'))).toBe(false)
  })

  it('survives a cache folder it cannot write to, and tries again later', async () => {
    const errors: unknown[] = []
    const blocked = join(dir, 'blocked')
    writeFileSync(blocked, 'a file where the cache folder should be')
    const denied = createArtworkFetcher({
      games: games(),
      artwork: artwork(),
      get: async (url) =>
        json.get([...json.keys()].find((k) => url.includes(k)) ?? '') ?? {
          status: 404,
          json: undefined
        },
      getBytes: async (url) => images.get(url)?.bytes ?? null,
      gridKey: () => null,
      igdbConfigured: () => igdbOn,
      igdbGame: async () => igdbAnswer,
      igdbSteamGame: async (appId) => {
        igdbAsked.push(appId)
        return igdbAnswer
      },
      cacheDir: blocked,
      decode: () => ({ width: 460, height: 215 }),
      clock: { now: () => new Date('2026-11-04T03:00:00Z') },
      wait: async () => {},
      onLibraryChanged: () => {},
      onError: (error) => errors.push(error)
    })
    const id = games().upsertSteamGame({ steamAppId: 620, title: 'Portal 2' }).id
    steamArt(620, 'https://x.steamstatic.com/h.jpg', '')
    image('https://x.steamstatic.com/h.jpg', 460, 215)

    await expect(denied.fetchMissing()).resolves.toBeUndefined()
    expect(artwork().get(id, 'header')).toBeNull()
    expect(errors.length).toBeGreaterThan(0)

    // With a usable folder the same game works: nothing was recorded as done.
    await fetcher.fetchMissing()
    expect(artwork().get(id, 'header')).toMatchObject({ source: 'steam' })
  })

  describe('what is tried again', () => {
    const noArt = (appId: number): void => steamArt(appId, '', '')
    const asked = (appId: number): number =>
      requested.filter((u) => u.includes(`appids=${appId}`)).length

    it('does not ask again at the next start about a game that got answers', async () => {
      const id = games().upsertSteamGame({ steamAppId: 620, title: 'No art anywhere' }).id
      noArt(620)
      await fetcher.fetchMissing()
      expect(asked(620)).toBe(1)
      expect(games().getById(id)?.artworkCheckedAt).toBe('2026-11-04T03:00:00Z')

      progress = []
      await fetcher.fetchMissing()
      expect(asked(620)).toBe(1)
      expect(progress).toEqual([]) // nothing to show either
    })

    it('a game the store does not know is also an answer', async () => {
      const id = games().upsertSteamGame({ steamAppId: 620, title: 'Delisted' }).id
      json.set('appids=620&filters', { status: 200, json: { 620: { success: false } } })
      await fetcher.fetchMissing()
      expect(games().getById(id)?.artworkCheckedAt).not.toBeNull()
    })

    it('the explicit retry asks again, also when requested during a run', async () => {
      games().upsertSteamGame({ steamAppId: 620, title: 'No art anywhere' })
      noArt(620)
      await fetcher.fetchMissing()
      await fetcher.fetchMissing({ retry: true })
      expect(asked(620)).toBe(2)

      const during = fetcher.fetchMissing()
      const retried = fetcher.fetchMissing({ retry: true })
      await Promise.all([during, retried])
      expect(asked(620)).toBe(3)
    })

    it('a bad SteamGridDB key is not an answer: the game stays to try', async () => {
      const id = games().upsertSteamGame({ steamAppId: 620, title: 'Portal 2' }).id
      noArt(620)
      gridKey = KEY
      json.set('steamgriddb.com', { status: 401, json: { success: false } })
      await fetcher.fetchMissing()
      expect(games().getById(id)?.artworkCheckedAt).toBeNull()
    })
  })

  describe('with no network', () => {
    it('stops at the first failure, ends the indicator and keeps everything to try', async () => {
      const first = games().upsertSteamGame({ steamAppId: 620, title: 'A' }).id
      const second = games().upsertSteamGame({ steamAppId: 730, title: 'B' }).id
      const offline = createArtworkFetcher({
        games: games(),
        artwork: artwork(),
        get: async (url) => {
          requested.push(url)
          throw new NetworkError()
        },
        getBytes: async () => null,
        gridKey: () => null,
        igdbConfigured: () => igdbOn,
        igdbGame: async () => igdbAnswer,
        igdbSteamGame: async (appId) => {
          igdbAsked.push(appId)
          return igdbAnswer
        },
        cacheDir: dir,
        decode: () => null,
        clock: { now: () => new Date('2026-11-04T03:00:00Z') },
        wait: async () => {},
        onLibraryChanged: () => {},
        onProgress: (value) => progress.push(value)
      })
      await offline.fetchMissing()
      expect(requested).toHaveLength(1)
      expect(progress).toEqual([{ done: 0, total: 2 }, null])
      expect(games().getById(first)?.artworkCheckedAt).toBeNull()
      expect(games().getById(second)?.artworkCheckedAt).toBeNull()
    })
  })

  describe('when a server answers but cannot serve', () => {
    const addGames = (count: number): number[] =>
      Array.from(
        { length: count },
        (_, i) => games().upsertSteamGame({ steamAppId: 1000 + i, title: `Game ${i}` }).id
      )
    const asked = (): number => requested.filter((u) => u.includes('appids=')).length

    it('is not "no network": it waits and goes on, leaving those games to try', async () => {
      const [limited, next] = addGames(2)
      json.set('appids=1000&', { status: 429, json: undefined })
      steamArt(1001, '', '')
      await fetcher.fetchMissing()
      expect(asked()).toBe(2)
      expect(waits).toContain(UNAVAILABLE_WAIT_MS)
      expect(games().getById(limited)?.artworkCheckedAt).toBeNull()
      expect(games().getById(next)?.artworkCheckedAt).not.toBeNull()
      expect(progress.at(-1)).toBeNull()
    })

    it('gives up after several in a row, and the indicator ends', async () => {
      addGames(20)
      json.set('appids=', { status: 503, json: undefined })
      await fetcher.fetchMissing()
      expect(asked()).toBe(UNAVAILABLE_LIMIT)
      expect(progress.at(-1)).toBeNull()
    })

    it('a success in between restarts the count', async () => {
      addGames(UNAVAILABLE_LIMIT + 3)
      json.set('appids=1000&', { status: 429, json: undefined })
      json.set('appids=1001&', { status: 429, json: undefined })
      steamArt(1002, '', '')
      for (let i = 3; i < UNAVAILABLE_LIMIT + 3; i++) {
        json.set(`appids=${1000 + i}&`, { status: 429, json: undefined })
      }
      await fetcher.fetchMissing()
      // 2 failures, 1 success, then the limit: all of them were asked.
      expect(asked()).toBe(UNAVAILABLE_LIMIT + 3)
    })

    it('SteamGridDB limiting behaves the same', async () => {
      const [first] = addGames(2)
      steamArt(1000, '', '')
      steamArt(1001, '', '')
      gridKey = KEY
      json.set('steamgriddb.com', { status: 429, json: undefined })
      await fetcher.fetchMissing()
      expect(asked()).toBe(2)
      expect(waits).toContain(UNAVAILABLE_WAIT_MS)
      expect(games().getById(first)?.artworkCheckedAt).toBeNull()
    })
  })

  it('reports progress per game with work, and stays silent when nothing is missing', async () => {
    games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' })
    games().create({ origin: 'manual', title: 'Not in the queue' })
    steamArt(2379780, 'https://x.steamstatic.com/h.jpg', 'https://x.steamstatic.com/bg.jpg')
    image('https://x.steamstatic.com/h.jpg', 460, 215)
    image('https://x.steamstatic.com/bg.jpg', 1438, 810)

    await fetcher.fetchMissing()
    expect(progress).toEqual([{ done: 0, total: 1 }, null])

    progress = []
    await fetcher.fetchMissing()
    expect(progress).toEqual([])
  })

  it('takes the best-voted SteamGridDB images and skips a wrong proportion', async () => {
    const id = games().upsertSteamGame({ steamAppId: 620, title: 'Portal 2' }).id
    steamArt(620, '', '')
    gridKey = KEY
    json.set('/grids/steam/620?dimensions=512x512', {
      status: 200,
      json: {
        success: true,
        data: [
          { url: 'https://cdn2.steamgriddb.com/low.png', score: 1 },
          { url: 'https://cdn2.steamgriddb.com/top.png', score: 9 },
          { url: 'https://cdn2.steamgriddb.com/nsfw.png', score: 99, nsfw: true }
        ]
      }
    })
    json.set('/grids/steam/620?dimensions=600x900', {
      status: 200,
      json: { success: true, data: [{ url: 'https://cdn2.steamgriddb.com/tall.png', score: 3 }] }
    })
    json.set('/logos/steam/620', { status: 200, json: { success: true, data: [] } })
    image('https://cdn2.steamgriddb.com/top.png', 512, 512)
    image('https://cdn2.steamgriddb.com/tall.png', 600, 600) // not 2:3

    await fetcher.fetchMissing()

    expect(artwork().get(id, 'cover_square')).toMatchObject({
      source: 'steamgriddb',
      sourceUrl: 'https://cdn2.steamgriddb.com/top.png'
    })
    expect(artwork().get(id, 'cover_portrait')).toBeNull()
    expect(artwork().get(id, 'logo')).toBeNull()
  })

  it('never replaces existing art and fetches nothing when everything is there', async () => {
    const id = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' }).id
    for (const kind of ['header', 'background'] as const) {
      artwork().save({
        gameId: id,
        kind,
        localPath: `${id}/${kind}.png`,
        source: 'user',
        sourceUrl: null,
        width: 1920,
        height: 1080,
        userSelected: true,
        fetchedAt: null
      })
    }
    await fetcher.fetchMissing()
    expect(requested).toEqual([])
    expect(artwork().get(id, 'header')?.source).toBe('user')
  })
})

describe('artwork fetcher: generated store backgrounds', () => {
  it('uses the first screenshot instead, also replacing one stored earlier', async () => {
    const id = games().upsertSteamGame({ steamAppId: 40800, title: 'Super Meat Boy' }).id
    const blurred = 'https://store.akamai.steamstatic.com/images/storepagebackground/app/40800?t=1'
    artwork().save({
      gameId: id,
      kind: 'background',
      localPath: String(id) + '/background.webp',
      source: 'steam',
      sourceUrl: blurred,
      width: 1438,
      height: 808,
      userSelected: false,
      fetchedAt: null
    })
    json.set('appids=40800&filters=basic,background,screenshots', {
      status: 200,
      json: {
        '40800': {
          success: true,
          data: {
            header_image: 'https://x.steamstatic.com/h.jpg',
            background_raw: blurred,
            screenshots: [{ path_full: 'https://x.steamstatic.com/ss.1920x1080.jpg' }]
          }
        }
      }
    })
    image('https://x.steamstatic.com/h.jpg', 460, 215)
    image('https://x.steamstatic.com/ss.1920x1080.jpg', 1920, 1080)

    await fetcher.fetchMissing()

    expect(artwork().get(id, 'background')).toMatchObject({
      sourceUrl: 'https://x.steamstatic.com/ss.1920x1080.jpg',
      width: 1920
    })
  })
})

describe('artwork fetcher: manual games', () => {
  it('searches SteamGridDB by name', async () => {
    expect(await fetcher.search('Hollow')).toEqual({
      ok: false,
      error: { code: 'not-configured' }
    })
    gridKey = KEY
    json.set('/search/autocomplete/Hollow', {
      status: 200,
      json: { success: true, data: [{ id: 77, name: 'Hollow Quest', release_date: 1577836800 }] }
    })
    expect(await fetcher.search('Hollow')).toEqual({
      ok: true,
      data: [{ id: 77, name: 'Hollow Quest', year: 2020 }]
    })
  })
})

describe('artwork fetcher: art the user removed', () => {
  it('does not bring it back, not even when asked to try again', async () => {
    const id = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' }).id
    steamArt(2379780, 'https://x.steamstatic.com/h.jpg', 'https://x.steamstatic.com/bg.jpg')
    image('https://x.steamstatic.com/h.jpg', 460, 215)
    image('https://x.steamstatic.com/bg.jpg', 1438, 810)
    artwork().remove(id, 'background', '2026-11-05T12:00:00Z')

    await fetcher.fetchMissing({ retry: true })

    expect(artwork().get(id, 'header')).not.toBeNull()
    expect(artwork().get(id, 'background')).toBeNull()
  })

  it('asks for nothing when all that is missing was removed', async () => {
    const id = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' }).id
    artwork().remove(id, 'background', '2026-11-05T12:00:00Z')
    artwork().remove(id, 'header', '2026-11-05T12:00:00Z')
    await fetcher.fetchMissing({ retry: true })
    expect(requested).toEqual([])
  })
})

describe('artwork fetcher: filled from IGDB', () => {
  const IGDB = 'https://images.igdb.com/igdb/image/upload/t_1080p'
  const game = (overrides: Partial<IgdbGameData> = {}): IgdbGameData => ({
    name: 'Hollow Quest',
    summary: null,
    releaseDate: null,
    developer: null,
    genres: [],
    requiredAge: null,
    cover: { imageId: 'cov', width: 810, height: 1080 },
    artworks: [
      { imageId: 'tall', width: 1000, height: 1500 },
      { imageId: 'art', width: 1920, height: 1080 }
    ],
    screenshots: [{ imageId: 'shot', width: 2560, height: 1440 }],
    logos: [{ imageId: 'log', width: 800, height: 300 }],
    ...overrides
  })
  const manual = (): number => games().create({ origin: 'manual', title: 'Hollow Quest' }).id

  beforeEach(() => {
    image(`${IGDB}/cov.jpg`, 810, 1080)
    image(`${IGDB}/art.jpg`, 1920, 1080)
    image(`${IGDB}/shot.jpg`, 1920, 1080)
    image(`${IGDB}/log.png`, 800, 300)
  })

  it('saves the portrait cover, the 16:9 background and the logo as chosen art', async () => {
    const id = manual()
    igdbAnswer = { ok: true, data: game() }

    expect(await fetcher.applyIgdb(id, 7)).toEqual({
      ok: true,
      data: ['cover_portrait', 'background', 'logo']
    })
    expect(artwork().get(id, 'cover_portrait')).toMatchObject({
      source: 'igdb',
      userSelected: true,
      width: 810
    })
    expect(artwork().get(id, 'background')?.sourceUrl).toBe(`${IGDB}/art.jpg`)
    // No key: the rest stays as placeholders, with no call to SteamGridDB.
    expect(artwork().get(id, 'cover_square')).toBeNull()
    expect(requested).toEqual([])
    expect(progress.at(-1)).toBeNull()
  })

  it('falls back to a screenshot when no artwork is 16:9', async () => {
    const id = manual()
    igdbAnswer = { ok: true, data: game({ artworks: [] }) }
    await fetcher.applyIgdb(id, 7)
    expect(artwork().get(id, 'background')?.sourceUrl).toBe(`${IGDB}/shot.jpg`)
  })

  it('never replaces art the game already has', async () => {
    const id = manual()
    artwork().save({
      gameId: id,
      kind: 'background',
      localPath: 'x/background.png',
      source: 'user',
      sourceUrl: null,
      width: 1920,
      height: 1080,
      userSelected: true,
      fetchedAt: '2026-11-04T03:00:00Z'
    })
    igdbAnswer = { ok: true, data: game() }
    expect(await fetcher.applyIgdb(id, 7)).toEqual({ ok: true, data: ['cover_portrait', 'logo'] })
    expect(artwork().get(id, 'background')).toMatchObject({ source: 'user' })
  })

  it('asks SteamGridDB for what is missing only under the very same name', async () => {
    gridKey = KEY
    const id = manual()
    igdbAnswer = { ok: true, data: game({ logos: [] }) }
    json.set('search/autocomplete', {
      status: 200,
      json: { success: true, data: [{ id: 9, name: 'hollow quest' }] }
    })
    json.set('/grids/game/9', {
      status: 200,
      json: {
        success: true,
        data: [{ id: 1, url: 'https://cdn2.steamgriddb.com/grid/s.png', width: 1024, height: 1024 }]
      }
    })
    image('https://cdn2.steamgriddb.com/grid/s.png', 1024, 1024)
    const result = await fetcher.applyIgdb(id, 7)
    expect(result.ok && result.data).toContain('cover_square')
    expect(artwork().get(id, 'cover_square')).toMatchObject({ source: 'steamgriddb' })
  })

  it('takes nothing from SteamGridDB under a different name', async () => {
    gridKey = KEY
    const id = manual()
    igdbAnswer = { ok: true, data: game() }
    json.set('search/autocomplete', {
      status: 200,
      json: { success: true, data: [{ id: 9, name: 'Hollow Quest 2' }] }
    })
    await fetcher.applyIgdb(id, 7)
    expect(artwork().get(id, 'cover_square')).toBeNull()
    expect(requested.some((u) => u.includes('/grids/'))).toBe(false)
  })

  it('reports IGDB failures and refuses Steam games', async () => {
    const id = manual()
    igdbAnswer = { ok: false, error: 'network' }
    expect(await fetcher.applyIgdb(id, 7)).toEqual({ ok: false, error: { code: 'network' } })
    expect(artwork().get(id, 'cover_portrait')).toBeNull()

    const steam = games().upsertSteamGame({ steamAppId: 10, title: 'S' }).id
    igdbAnswer = { ok: true, data: game() }
    expect(await fetcher.applyIgdb(steam, 7)).toEqual({ ok: false, error: { code: 'not-found' } })
  })
})

describe('artwork fetcher: Steam games with IGDB', () => {
  const IGDB = 'https://images.igdb.com/igdb/image/upload/t_1080p'
  const full: IgdbGameData = {
    name: 'Balatro',
    summary: null,
    releaseDate: null,
    developer: null,
    genres: [],
    requiredAge: null,
    cover: { imageId: 'cov', width: 810, height: 1080 },
    artworks: [{ imageId: 'art', width: 1920, height: 1080 }],
    screenshots: [],
    logos: [{ imageId: 'log', width: 800, height: 300 }]
  }
  const STEAM_HEADER = 'https://x.steamstatic.com/h.jpg'
  const STEAM_BACKGROUND = 'https://x.steamstatic.com/bg.jpg'
  const GRID = 'https://cdn2.steamgriddb.com'
  const balatro = (): number => games().upsertSteamGame({ steamAppId: 620, title: 'Balatro' }).id
  const gridAnswer = (
    url: string,
    width: number,
    height: number
  ): { status: number; json: unknown } => ({
    status: 200,
    json: { success: true, data: [{ id: 1, url, width, height, score: 1 }] }
  })

  beforeEach(() => {
    igdbOn = true
    igdbAnswer = { ok: true, data: full }
    gridKey = KEY
    image(`${IGDB}/cov.jpg`, 810, 1080)
    image(`${IGDB}/art.jpg`, 1920, 1080)
    image(`${IGDB}/log.png`, 800, 300)
    image(STEAM_HEADER, 460, 215)
    image(STEAM_BACKGROUND, 1438, 810)
    image(`${GRID}/square.png`, 512, 512)
    image(`${GRID}/portrait.png`, 600, 900)
    image(`${GRID}/logo.png`, 800, 300)
    steamArt(620, STEAM_HEADER, STEAM_BACKGROUND)
    json.set('/grids/steam/620?dimensions=512x512', gridAnswer(`${GRID}/square.png`, 512, 512))
    json.set('/grids/steam/620?dimensions=600x900', gridAnswer(`${GRID}/portrait.png`, 600, 900))
    json.set('/logos/steam/620', gridAnswer(`${GRID}/logo.png`, 800, 300))
  })

  const sources = (id: number): Record<string, string | undefined> => ({
    portrait: artwork().get(id, 'cover_portrait')?.source,
    logo: artwork().get(id, 'logo')?.source,
    background: artwork().get(id, 'background')?.source,
    square: artwork().get(id, 'cover_square')?.source,
    header: artwork().get(id, 'header')?.source
  })

  it('takes the portrait cover, logo and background from IGDB, the rest from the others', async () => {
    const id = balatro()
    await fetcher.fetchMissing()
    expect(igdbAsked).toEqual([620])
    expect(sources(id)).toEqual({
      portrait: 'igdb',
      logo: 'igdb',
      background: 'igdb',
      square: 'steamgriddb',
      header: 'steam'
    })
    // Automatic art: a later choice by the user can still replace it.
    expect(artwork().get(id, 'logo')?.userSelected).toBe(false)
    expect(requested.some((u) => u.includes('dimensions=600x900'))).toBe(false)
    expect(requested.some((u) => u.includes('/logos/steam/'))).toBe(false)
    expect(games().getById(id)?.artworkCheckedAt).not.toBeNull()
  })

  it('falls back kind by kind when IGDB does not have it', async () => {
    const id = balatro()
    igdbAnswer = { ok: true, data: { ...full, logos: [], artworks: [] } }
    await fetcher.fetchMissing()
    expect(sources(id)).toMatchObject({
      portrait: 'igdb',
      logo: 'steamgriddb',
      background: 'steam'
    })
  })

  it('uses the other sources for a game IGDB does not know, and counts it as answered', async () => {
    const id = balatro()
    igdbAnswer = { ok: true, data: null }
    await fetcher.fetchMissing()
    expect(sources(id)).toMatchObject({
      portrait: 'steamgriddb',
      logo: 'steamgriddb',
      background: 'steam'
    })
    expect(games().getById(id)?.artworkCheckedAt).not.toBeNull()
  })

  it('falls back when an IGDB image fails validation', async () => {
    const id = balatro()
    image(`${IGDB}/cov.jpg`, 1000, 1000)
    await fetcher.fetchMissing()
    expect(sources(id).portrait).toBe('steamgriddb')
  })

  it.each(['unavailable', 'invalid-key', 'invalid-response'] as const)(
    'keeps the other sources working when IGDB answers %s, and tries again later',
    async (error) => {
      const id = balatro()
      igdbAnswer = { ok: false, error }
      await fetcher.fetchMissing()
      expect(sources(id)).toMatchObject({
        portrait: 'steamgriddb',
        background: 'steam',
        header: 'steam'
      })
      expect(games().getById(id)?.artworkCheckedAt).toBeNull()
    }
  )

  it('stops the queue with no network', async () => {
    const id = balatro()
    games().upsertSteamGame({ steamAppId: 730, title: 'Zzz' })
    igdbAnswer = { ok: false, error: 'network' }
    await fetcher.fetchMissing()
    expect(igdbAsked).toEqual([620])
    expect(requested).toEqual([])
    expect(games().getById(id)?.artworkCheckedAt).toBeNull()
  })

  it('works with IGDB alone, without a SteamGridDB key', async () => {
    gridKey = null
    const id = balatro()
    artwork().save({
      gameId: id,
      kind: 'header',
      localPath: 'x/header.png',
      source: 'steam',
      sourceUrl: STEAM_HEADER,
      width: 460,
      height: 215,
      userSelected: false,
      fetchedAt: null
    })
    artwork().save({
      gameId: id,
      kind: 'background',
      localPath: 'x/background.png',
      source: 'steam',
      sourceUrl: STEAM_BACKGROUND,
      width: 1438,
      height: 810,
      userSelected: false,
      fetchedAt: null
    })
    await fetcher.fetchMissing()
    expect(sources(id)).toMatchObject({ portrait: 'igdb', logo: 'igdb', background: 'steam' })
    expect(requested.some((u) => u.includes('steamgriddb'))).toBe(false)
  })

  it('never replaces art a game has, and leaves answered games alone at startup', async () => {
    const id = balatro()
    artwork().save({
      gameId: id,
      kind: 'cover_portrait',
      localPath: 'x/cover_portrait.png',
      source: 'steamgriddb',
      sourceUrl: `${GRID}/portrait.png`,
      width: 600,
      height: 900,
      userSelected: false,
      fetchedAt: null
    })
    await fetcher.fetchMissing()
    expect(sources(id).portrait).toBe('steamgriddb')

    games().setArtworkChecked(id, '2026-11-04T03:00:00Z')
    igdbAsked = []
    await fetcher.fetchMissing()
    expect(igdbAsked).toEqual([])
  })

  it('asks IGDB nothing when it is not configured', async () => {
    igdbOn = false
    const id = balatro()
    await fetcher.fetchMissing()
    expect(igdbAsked).toEqual([])
    expect(sources(id)).toMatchObject({ portrait: 'steamgriddb', background: 'steam' })
  })
})
