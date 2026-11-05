import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HttpGet, HttpGetBytes } from '../../../src/integrations/http'
import {
  createArtworkRepository,
  createGameRepository,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import {
  createArtworkFetcher,
  type ArtworkFetcher
} from '../../../src/main/artwork/artwork-fetcher'
import { createTestDb } from '../../helpers/db'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const KEY = 'ABCDEF0123456789ABCDEF0123456789'

let dir: string
let db: SqliteDatabase
let json: Map<string, { status: number; json: unknown }>
let images: Map<string, { bytes: Uint8Array; size: [number, number] }>
let requested: string[]
let gridKey: string | null
let fetcher: ArtworkFetcher
let progress: ({ done: number; total: number } | null)[]

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
  progress = []
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
    wait: async () => {},
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
  it('searches and applies the chosen SteamGridDB game as user-selected art', async () => {
    const id = games().create({ origin: 'manual', title: 'Hollow Quest' }).id
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

    json.set('/grids/game/77?dimensions=512x512', {
      status: 200,
      json: { success: true, data: [{ url: 'https://cdn2.steamgriddb.com/sq.png', score: 5 }] }
    })
    json.set('/grids/game/77?dimensions=460x215', {
      status: 200,
      json: { success: true, data: [{ url: 'https://cdn2.steamgriddb.com/hd.png', score: 5 }] }
    })
    image('https://cdn2.steamgriddb.com/sq.png', 1024, 1024)
    image('https://cdn2.steamgriddb.com/hd.png', 920, 430)

    expect(await fetcher.applySteamGridDb(id, 77)).toEqual({
      ok: true,
      data: ['cover_square', 'header']
    })
    expect(artwork().get(id, 'cover_square')).toMatchObject({ userSelected: true })
  })

  it('refuses Steam games and reports a bad key', async () => {
    const steam = games().upsertSteamGame({ steamAppId: 620, title: 'Portal 2' }).id
    gridKey = KEY
    expect(await fetcher.applySteamGridDb(steam, 1)).toEqual({
      ok: false,
      error: { code: 'not-found' }
    })
    const manual = games().create({ origin: 'manual', title: 'X' }).id
    json.set('steamgriddb.com', { status: 401, json: { success: false } })
    expect(await fetcher.applySteamGridDb(manual, 1)).toEqual({
      ok: false,
      error: { code: 'invalid-key' }
    })
  })
})
