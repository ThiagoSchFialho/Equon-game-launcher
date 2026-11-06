import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createArtworkRepository,
  createGameRepository,
  createUnitOfWork,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import type { IgdbGameData } from '../../../src/integrations/igdb/games'
import type { IgdbResult } from '../../../src/integrations/igdb/igdb'
import {
  createArtworkEditor,
  type ArtworkEditor,
  type ArtworkEditorDeps
} from '../../../src/main/artwork/artwork-editor'
import { createTestDb } from '../../helpers/db'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const KEY = 'ABCDEF0123456789ABCDEF0123456789'
const IGDB = 'https://images.igdb.com/igdb/image/upload/t_1080p'
const GRID = 'https://cdn2.steamgriddb.com'

const igdbData: IgdbGameData = {
  name: 'Balatro',
  summary: null,
  releaseDate: null,
  developer: null,
  genres: [],
  requiredAge: null,
  cover: { imageId: 'cov', width: 810, height: 1080 },
  artworks: [{ imageId: 'art', width: 1920, height: 1080 }],
  screenshots: [],
  logos: []
}

let dir: string
let db: SqliteDatabase
let editor: ArtworkEditor
let size: { width: number; height: number }
let gridKey: string | null
let json: unknown
let igdbAnswer: IgdbResult<IgdbGameData | null>
let igdbAsked: string[]
let downloads: Map<string, Uint8Array>
let getBytes: ReturnType<typeof vi.fn<ArtworkEditorDeps['getBytes']>>
let libraryChanged: number
let requested: string[]
let manualId: number
let steamId: number

const artwork = (): ReturnType<typeof createArtworkRepository> => createArtworkRepository(db)

const build = (cacheDir: string): ArtworkEditor =>
  createArtworkEditor({
    games: createGameRepository(db),
    artwork: artwork(),
    uow: createUnitOfWork(db),
    get: async (url) => {
      requested.push(url)
      return { status: 200, json }
    },
    getBytes,
    gridKey: () => gridKey,
    igdbGame: async (id) => {
      igdbAsked.push(`game:${id}`)
      return igdbAnswer
    },
    igdbSteamGame: async (appId) => {
      igdbAsked.push(`steam:${appId}`)
      return igdbAnswer
    },
    cacheDir,
    decode: () => size,
    clock: { now: () => new Date('2026-11-05T12:00:00Z') },
    onLibraryChanged: () => {
      libraryChanged += 1
    }
  })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'equon-editor-'))
  db = createTestDb()
  size = { width: 1920, height: 1080 }
  gridKey = KEY
  json = undefined
  igdbAnswer = { ok: true, data: igdbData }
  igdbAsked = []
  downloads = new Map()
  getBytes = vi.fn<ArtworkEditorDeps['getBytes']>(async (url) => downloads.get(url) ?? null)
  libraryChanged = 0
  requested = []
  manualId = createGameRepository(db).create({ origin: 'manual', title: 'Hollow' }).id
  steamId = createGameRepository(db).upsertSteamGame({ steamAppId: 620, title: 'Portal 2' }).id
  editor = build(join(dir, 'cache'))
  editor.begin(manualId)
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const localImage = (name = 'bg.png', bytes: Buffer = PNG): string => {
  const path = join(dir, name)
  writeFileSync(path, bytes)
  return path
}

describe('art editor: nothing changes until saved', () => {
  it('keeps a chosen file in memory, previews it, and writes it only on save', () => {
    const result = editor.fromFile(manualId, 'background', localImage())
    expect(result).toEqual({ ok: true, data: { version: 1 } })
    expect(editor.draftImage('background')).toMatchObject({ mime: 'image/png' })
    expect(artwork().get(manualId, 'background')).toBeNull()
    expect(existsSync(join(dir, 'cache', String(manualId)))).toBe(false)

    expect(editor.save(manualId, [])).toEqual({ ok: true, data: null })
    expect(artwork().get(manualId, 'background')).toMatchObject({
      source: 'user',
      sourceUrl: null,
      userSelected: true,
      width: 1920,
      fetchedAt: '2026-11-05T12:00:00Z'
    })
    expect(readFileSync(join(dir, 'cache', String(manualId), 'background.png'))).toEqual(PNG)
    expect(libraryChanged).toBe(1)
    expect(editor.draftImage('background')).toBeNull()
  })

  it('drops everything when the screen is left', () => {
    editor.fromFile(manualId, 'background', localImage())
    editor.end()
    expect(editor.draftImage('background')).toBeNull()
    expect(editor.save(manualId, [])).toEqual({ ok: false, error: { code: 'not-found' } })
    expect(artwork().get(manualId, 'background')).toBeNull()
  })

  it('tells each preview apart', () => {
    size = { width: 1920, height: 1080 }
    const first = editor.fromFile(manualId, 'background', localImage())
    const second = editor.fromFile(manualId, 'background', localImage('other.jpg', JPG))
    expect(first.ok && second.ok && second.data.version > first.data.version).toBe(true)
    expect(editor.draftImage('background')).toMatchObject({ mime: 'image/jpeg' })
  })

  it('validates a file like any other art', () => {
    size = { width: 1000, height: 1000 }
    expect(editor.fromFile(manualId, 'background', localImage())).toEqual({
      ok: false,
      error: { code: 'wrong-proportion' }
    })
    expect(editor.fromFile(manualId, 'cover_square', localImage())).toMatchObject({ ok: true })
    expect(editor.fromFile(manualId, 'logo', localImage('notes.txt', Buffer.from('x')))).toEqual({
      ok: false,
      error: { code: 'unsupported-type' }
    })
    expect(editor.fromFile(manualId, 'logo', 'relative\\logo.png')).toEqual({
      ok: false,
      error: { code: 'unsupported-type' }
    })
    expect(editor.fromFile(manualId, 'logo', join(dir, 'missing.png'))).toEqual({
      ok: false,
      error: { code: 'unreadable' }
    })
  })

  it('ignores a download that ends after the user left', async () => {
    downloads.set(`${IGDB}/art.jpg`, PNG)
    const pending = editor.fromIgdb(manualId, 'background', 7)
    editor.end()
    expect(await pending).toEqual({ ok: false, error: { code: 'not-found' } })
    expect(editor.draftImage('background')).toBeNull()
  })

  it('keeps what is pending and the database as they were when the disk fails', () => {
    const blocked = join(dir, 'blocked')
    writeFileSync(blocked, 'a file where the cache folder should be')
    const denied = build(blocked)
    denied.begin(manualId)
    denied.fromFile(manualId, 'background', localImage())
    expect(denied.save(manualId, [])).toEqual({ ok: false, error: { code: 'storage-failed' } })
    expect(artwork().get(manualId, 'background')).toBeNull()
    expect(denied.draftImage('background')).not.toBeNull()
    expect(libraryChanged).toBe(0)
  })
})

describe('art editor: removing', () => {
  it('removes the row and the file together, and the mark keeps it away', () => {
    editor.fromFile(manualId, 'background', localImage())
    editor.save(manualId, [])
    const file = join(dir, 'cache', String(manualId), 'background.png')
    expect(existsSync(file)).toBe(true)

    editor.begin(manualId)
    expect(editor.save(manualId, ['background'])).toEqual({ ok: true, data: null })
    expect(artwork().get(manualId, 'background')).toBeNull()
    expect(existsSync(file)).toBe(false)
    expect(artwork().listRemoved().get(manualId)).toEqual(['background'])
  })

  it('removal wins over an image chosen for the same kind', () => {
    editor.fromFile(manualId, 'background', localImage())
    editor.save(manualId, ['background'])
    expect(artwork().get(manualId, 'background')).toBeNull()
  })

  it('choosing another image later clears the mark', () => {
    editor.save(manualId, ['background'])
    editor.begin(manualId)
    editor.fromFile(manualId, 'background', localImage())
    editor.save(manualId, [])
    expect(artwork().get(manualId, 'background')).toMatchObject({ userSelected: true })
    expect(artwork().listRemoved().get(manualId)).toBeUndefined()
  })

  it('saves and removes different kinds in one go', () => {
    editor.fromFile(manualId, 'background', localImage())
    editor.save(manualId, ['logo'])
    expect(artwork().get(manualId, 'background')).not.toBeNull()
    expect(artwork().listRemoved().get(manualId)).toEqual(['logo'])
  })
})

describe('art editor: IGDB', () => {
  it('finds a Steam game by its App ID and uses the image of that kind', async () => {
    editor.begin(steamId)
    size = { width: 810, height: 1080 }
    downloads.set(`${IGDB}/cov.jpg`, JPG)
    expect(await editor.fromIgdb(steamId, 'cover_portrait', null)).toMatchObject({ ok: true })
    expect(igdbAsked).toEqual(['steam:620'])
    editor.save(steamId, [])
    expect(artwork().get(steamId, 'cover_portrait')).toMatchObject({
      source: 'igdb',
      sourceUrl: `${IGDB}/cov.jpg`,
      userSelected: true
    })
  })

  it('uses the game the user confirmed', async () => {
    downloads.set(`${IGDB}/art.jpg`, JPG)
    expect(await editor.fromIgdb(manualId, 'background', 7)).toMatchObject({ ok: true })
    expect(igdbAsked).toEqual(['game:7'])
  })

  it('explains what cannot be done', async () => {
    expect(await editor.fromIgdb(manualId, 'background', null)).toEqual({
      ok: false,
      error: { code: 'not-found' }
    })
    expect(await editor.fromIgdb(manualId, 'cover_square', 7)).toEqual({
      ok: false,
      error: { code: 'no-image' }
    })
    expect(await editor.fromIgdb(manualId, 'logo', 7)).toEqual({
      ok: false,
      error: { code: 'no-image' }
    })
    expect(await editor.fromIgdb(manualId, 'background', 7)).toEqual({
      ok: false,
      error: { code: 'download-failed' }
    })
    igdbAnswer = { ok: true, data: null }
    expect(await editor.fromIgdb(manualId, 'background', 7)).toEqual({
      ok: false,
      error: { code: 'not-found' }
    })
    igdbAnswer = { ok: false, error: 'not-configured' }
    expect(await editor.fromIgdb(manualId, 'background', 7)).toEqual({
      ok: false,
      error: { code: 'not-configured' }
    })
  })
})

describe('art editor: SteamGridDB gallery', () => {
  const listed = (id: number, extra: object = {}): object => ({
    id,
    url: `${GRID}/grid/${id}.png`,
    thumb: `${GRID}/thumb/${id}.jpg`,
    width: 600,
    height: 900,
    score: 0,
    ...extra
  })

  it('lists images best voted first, and hands out no address', async () => {
    json = {
      success: true,
      data: [
        listed(1, { score: 1 }),
        listed(2, { score: 9 }),
        listed(3, { nsfw: true }),
        listed(4, { humor: true }),
        listed(5, { url: 'https://evil.example/x.png' }),
        listed(6, { thumb: 'http://cdn2.steamgriddb.com/x.jpg' }),
        { id: 'broken' }
      ]
    }
    const result = await editor.gridAssets(manualId, 'cover_portrait', 77)
    expect(result).toEqual({
      ok: true,
      data: [
        { id: 2, width: 600, height: 900 },
        { id: 1, width: 600, height: 900 }
      ]
    })
    expect(requested[0]).toContain('/grids/game/77?dimensions=600x900')
  })

  it('goes by App ID for a Steam game, and lists logos from their endpoint', async () => {
    editor.begin(steamId)
    json = { success: true, data: [] }
    await editor.gridAssets(steamId, 'logo', null)
    expect(requested[0]).toContain('/logos/steam/620?')
  })

  it('caps the list', async () => {
    json = {
      success: true,
      data: Array.from({ length: 60 }, (_, index) => listed(index + 1))
    }
    const result = await editor.gridAssets(manualId, 'cover_portrait', 77)
    expect(result.ok && result.data).toHaveLength(40)
  })

  it('explains what cannot be done', async () => {
    expect(await editor.gridAssets(manualId, 'background', 77)).toEqual({
      ok: false,
      error: { code: 'no-image' }
    })
    expect(await editor.gridAssets(manualId, 'logo', null)).toEqual({
      ok: false,
      error: { code: 'not-found' }
    })
    json = { nope: true }
    expect(await editor.gridAssets(manualId, 'logo', 77)).toEqual({
      ok: false,
      error: { code: 'invalid-response' }
    })
    gridKey = null
    expect(await editor.gridAssets(manualId, 'logo', 77)).toEqual({
      ok: false,
      error: { code: 'not-configured' }
    })
  })

  it('downloads only an image it listed', async () => {
    json = { success: true, data: [listed(2)] }
    await editor.gridAssets(manualId, 'cover_portrait', 77)
    size = { width: 600, height: 900 }
    downloads.set(`${GRID}/grid/2.png`, PNG)

    expect(await editor.fromGrid(manualId, 'cover_portrait', 99)).toEqual({
      ok: false,
      error: { code: 'not-found' }
    })
    expect(await editor.fromGrid(manualId, 'cover_portrait', 2)).toMatchObject({ ok: true })
    editor.save(manualId, [])
    expect(artwork().get(manualId, 'cover_portrait')).toMatchObject({
      source: 'steamgriddb',
      sourceUrl: `${GRID}/grid/2.png`,
      userSelected: true
    })
  })

  it('serves thumbnails it listed, once each, with their real type', async () => {
    json = { success: true, data: [listed(2), listed(3)] }
    await editor.gridAssets(manualId, 'cover_portrait', 77)
    downloads.set(`${GRID}/thumb/2.jpg`, JPG)
    downloads.set(`${GRID}/thumb/3.jpg`, Buffer.from('<html>not an image</html>'))

    expect(await editor.gridThumbnail(2)).toMatchObject({ mime: 'image/jpeg' })
    await editor.gridThumbnail(2)
    expect(getBytes).toHaveBeenCalledTimes(1)
    expect(await editor.gridThumbnail(3)).toBeNull()
    expect(await editor.gridThumbnail(99)).toBeNull()
    expect(getBytes).toHaveBeenCalledTimes(2)

    editor.end()
    expect(await editor.gridThumbnail(2)).toBeNull()
  })
})
