import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LaunchError, type GameRunner } from '../../../src/core/application'
import { createFileInspector } from '../../../src/infrastructure/filesystem/file-inspector'
import { readShortcutUrl } from '../../../src/infrastructure/filesystem/shortcut-reader'
import {
  createArtworkRepository,
  createEmulatorRepository,
  createGameRepository,
  createGenreRepository,
  createLaunchConfigRepository,
  createOriginRepository,
  createUnitOfWork,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import {
  createManualGameService,
  type ManualGameService
} from '../../../src/main/games/manual-game-service'
import type { ManualGameForm } from '../../../src/shared/ipc/contract'
import { count, createTestDb } from '../../helpers/db'

let dir: string
let db: SqliteDatabase
let service: ManualGameService
let running: number[]
let decoded: { width: number; height: number } | null

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])

const form = (overrides: Partial<ManualGameForm> = {}): ManualGameForm => ({
  title: 'Hollow Quest',
  description: null,
  developer: null,
  releaseDate: null,
  requiredAge: null,
  playtimeOffset: 0,
  origin: 'manual',
  executablePath: join(dir, 'game.exe'),
  romPath: null,
  arguments: [],
  workingDirectory: null,
  backgroundPath: null,
  ...overrides
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'equon-svc-'))
  writeFileSync(join(dir, 'game.exe'), '')
  writeFileSync(join(dir, 'bg.png'), PNG)
  db = createTestDb()
  running = []
  decoded = { width: 1920, height: 1080 }
  const runner: GameRunner = {
    runningGameIds: () => running,
    launch: async (id) => {
      if (id === 404) throw new LaunchError('not-found')
    }
  }
  service = createManualGameService({
    games: createGameRepository(db),
    genres: createGenreRepository(db),
    configs: createLaunchConfigRepository(db),
    origins: createOriginRepository(db),
    emulators: createEmulatorRepository(db),
    artwork: createArtworkRepository(db),
    uow: createUnitOfWork(db),
    inspector: createFileInspector(),
    runner,
    artworkCacheDir: join(dir, 'cache'),
    decodeImage: () => decoded,
    readShortcut: readShortcutUrl
  })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('manual game service', () => {
  it('stores the genres filled from IGDB, and keeps those a game already has', async () => {
    const genres = createGenreRepository(db)
    const created = await service.create(form({ genres: ['RPG', 'Indie'] }))
    const id = created.ok ? created.data.id : 0
    expect(genres.listForGame(id).map((g) => g.name)).toEqual(
      expect.arrayContaining(['RPG', 'Indie'])
    )
    await service.update(id, form({ genres: ['Luta'] }))
    expect(genres.listForGame(id).map((g) => g.name)).not.toContain('Luta')
    await service.update(id, form())
    expect(genres.listForGame(id)).toHaveLength(2)
  })

  it('creates a game with its background', async () => {
    const result = await service.create(form({ backgroundPath: join(dir, 'bg.png') }))
    expect(result.ok).toBe(true)
    const id = result.ok ? result.data.id : 0
    expect(createArtworkRepository(db).get(id, 'background')).toMatchObject({
      source: 'user',
      userSelected: true,
      width: 1920
    })
    expect(existsSync(join(dir, 'cache', String(id), 'background.png'))).toBe(true)
  })

  it('returns field errors as data and writes nothing', async () => {
    expect(await service.create(form({ title: ' ' }))).toEqual({
      ok: false,
      error: { code: 'required', field: 'title' }
    })
    expect(await service.create(form({ executablePath: join(dir, 'missing.exe') }))).toEqual({
      ok: false,
      error: { code: 'missing', field: 'executablePath' }
    })
    decoded = { width: 1000, height: 1000 }
    expect(await service.create(form({ backgroundPath: join(dir, 'bg.png') }))).toEqual({
      ok: false,
      error: { code: 'wrong-proportion', field: 'backgroundPath' }
    })
    expect(count(db, 'games')).toBe(0)
  })

  it('rejects images that are not images by extension before reading them', async () => {
    writeFileSync(join(dir, 'notes.txt'), 'x')
    expect(await service.create(form({ backgroundPath: join(dir, 'notes.txt') }))).toMatchObject({
      ok: false,
      error: { code: 'unsupported-type' }
    })
  })

  it('updates only non-Steam games', async () => {
    const created = await service.create(form())
    const id = created.ok ? created.data.id : 0
    expect(await service.update(id, form({ title: 'Renamed' }))).toEqual({ ok: true, data: { id } })
    const steam = createGameRepository(db).upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    expect(await service.update(steam.id, form())).toEqual({
      ok: false,
      error: { code: 'not-found' }
    })
  })

  it('removes a game and its artwork, but not while it runs or for Steam games', async () => {
    const created = await service.create(form({ backgroundPath: join(dir, 'bg.png') }))
    const id = created.ok ? created.data.id : 0
    running = [id]
    expect(await service.remove(id)).toEqual({ ok: false, error: { code: 'already-running' } })
    running = []
    expect(await service.remove(id)).toEqual({ ok: true, data: null })
    expect(existsSync(join(dir, 'cache', String(id)))).toBe(false)
    expect(count(db, 'games')).toBe(0)

    const steam = createGameRepository(db).upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    expect(await service.remove(steam.id)).toEqual({ ok: false, error: { code: 'not-found' } })
  })

  it('sets hidden and beated for any origin, keeping the other flag', async () => {
    const steam = createGameRepository(db).upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    expect(await service.setFlags(steam.id, { hidden: true })).toEqual({ ok: true, data: null })
    expect(await service.setFlags(steam.id, { beated: true })).toEqual({ ok: true, data: null })
    expect(createGameRepository(db).getById(steam.id)).toMatchObject({ hidden: true, beated: true })
    expect(await service.setFlags(9999, { hidden: true })).toEqual({
      ok: false,
      error: { code: 'not-found' }
    })
  })

  it('maps launch errors to codes', async () => {
    expect(await service.launch(404)).toEqual({ ok: false, error: { code: 'not-found' } })
    expect(await service.launch(1)).toEqual({ ok: true, data: null })
  })

  it('manages origins', async () => {
    const created = await service.createOrigin('Nintendo 64')
    expect(created).toMatchObject({ ok: true, data: { key: 'nintendo-64' } })
    expect(await service.createOrigin('nintendo 64')).toEqual({
      ok: false,
      error: { code: 'duplicate-name', field: 'name' }
    })
    expect(await service.removeOrigin('ps2')).toEqual({
      ok: false,
      error: { code: 'builtin-origin' }
    })
    expect(await service.removeOrigin('nintendo-64')).toEqual({ ok: true, data: null })
  })

  it('configures the Yuzu executable', async () => {
    expect(service.listEmulators()).toEqual([
      {
        key: 'yuzu',
        name: 'Yuzu',
        origin: 'yuzu',
        romExtensions: ['.nsp', '.xci', '.nca', '.nro', '.nso'],
        executablePath: null
      }
    ])
    writeFileSync(join(dir, 'yuzu.exe'), '')
    expect(await service.setEmulator('yuzu', join(dir, 'yuzu.exe'))).toMatchObject({
      ok: true,
      data: { executablePath: join(dir, 'yuzu.exe') }
    })
    expect(await service.setEmulator('yuzu', join(dir, 'nope.exe'))).toEqual({
      ok: false,
      error: { code: 'missing', field: 'executablePath' }
    })
    writeFileSync(join(dir, 'yuzu.url'), '[InternetShortcut]\nURL=steam://x')
    expect(await service.setEmulator('yuzu', join(dir, 'yuzu.url'))).toMatchObject({
      ok: false,
      error: { code: 'not-exe' }
    })
    expect(await service.setEmulator('pcsx2', join(dir, 'yuzu.exe'))).toMatchObject({ ok: false })
    expect(await service.removeEmulator('yuzu')).toEqual({ ok: true, data: null })
    expect(service.listEmulators()[0].executablePath).toBeNull()
  })

  it('creates Yuzu games from a ROM', async () => {
    writeFileSync(join(dir, 'Zelda.nsp'), '')
    const result = await service.create(
      form({ origin: 'yuzu', executablePath: '', romPath: join(dir, 'Zelda.nsp') })
    )
    expect(result.ok).toBe(true)
    const id = result.ok ? result.data.id : 0
    expect(createLaunchConfigRepository(db).get(id)).toMatchObject({
      executablePath: null,
      romPath: join(dir, 'Zelda.nsp')
    })
    expect(
      await service.create(form({ origin: 'yuzu', executablePath: '', romPath: null }))
    ).toEqual({
      ok: false,
      error: { code: 'required', field: 'romPath' }
    })
  })

  it('accepts .url shortcuts to store URLs only', async () => {
    writeFileSync(
      join(dir, 'Epic.url'),
      '[InternetShortcut]\r\nURL=com.epicgames.launcher://apps/x?action=launch\r\n'
    )
    writeFileSync(join(dir, 'Web.url'), '[InternetShortcut]\r\nURL=https://example.com\r\n')
    expect((await service.create(form({ executablePath: join(dir, 'Epic.url') }))).ok).toBe(true)
    expect(await service.create(form({ executablePath: join(dir, 'Web.url') }))).toEqual({
      ok: false,
      error: { code: 'shortcut-scheme', field: 'executablePath' }
    })
  })
})
