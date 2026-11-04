import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HttpGet, HttpGetBytes } from '../../../src/integrations/http'
import { achievementIconPath } from '../../../src/infrastructure/artwork/achievement-icons'
import {
  createAchievementRepository,
  createArtworkRepository,
  createGameRepository,
  createOriginRepository,
  createUnitOfWork,
  createUserRepository,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import {
  getAchievementsOverview,
  getGameAchievements
} from '../../../src/main/achievements/achievement-queries'
import {
  AFTER_CLOSE_DELAY_MS,
  createAchievementSync,
  type AchievementSync
} from '../../../src/main/achievements/achievement-sync'
import { achievementsOverviewSchema } from '../../../src/shared/ipc/schemas'
import { createTestDb } from '../../helpers/db'

const KEY = 'ABCDEF0123456789ABCDEF0123456789'
const STEAM_ID = '76561197960287930'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])

let dir: string
let db: SqliteDatabase
let sync: AchievementSync
let credentials: { steamId: string | null; steamKey: string | null }
let requested: string[]
let waits: number[]
let broken: Set<number>
let clock: Date

const games = (): ReturnType<typeof createGameRepository> => createGameRepository(db)
const achievements = (): ReturnType<typeof createAchievementRepository> =>
  createAchievementRepository(db)
const users = (): ReturnType<typeof createUserRepository> => createUserRepository(db)

/** Three achievements for every app, except app 100 (none) and those in `broken`. */
const get: HttpGet = async (url) => {
  requested.push(url)
  const appId = Number(/(?:appid|gameid)=(\d+)/.exec(url)?.[1])
  if (broken.has(appId)) return { status: 500, json: null }
  if (url.includes('GetSchemaForGame')) {
    if (appId === 100) return { status: 200, json: { game: {} } }
    return {
      status: 200,
      json: {
        game: {
          availableGameStats: {
            achievements: ['RARE', 'MID', 'COMMON'].map((name) => ({
              name,
              displayName: name,
              description: `Desc ${name}`,
              icon: `https://steamcdn-a.akamaihd.net/${name}.png`,
              icongray: `https://steamcdn-a.akamaihd.net/${name}-gray.png`
            }))
          }
        }
      }
    }
  }
  if (url.includes('GetPlayerAchievements')) {
    return {
      status: 200,
      json: {
        playerstats: {
          success: true,
          achievements: [
            { apiname: 'RARE', achieved: 1, unlocktime: 1793750400 },
            { apiname: 'MID', achieved: appId === 200 ? 1 : 0, unlocktime: 1793750500 },
            { apiname: 'COMMON', achieved: appId === 200 ? 1 : 0, unlocktime: 1793750600 }
          ]
        }
      }
    }
  }
  return {
    status: 200,
    json: {
      achievementpercentages: {
        achievements: [
          { name: 'RARE', percent: '5.0' },
          { name: 'MID', percent: '30.0' }
          // COMMON has no known percentage.
        ]
      }
    }
  }
}
const fetchedImages: string[] = []
const getBytes: HttpGetBytes = async (url) => {
  fetchedImages.push(url)
  return url.includes('MID') ? null : new Uint8Array(PNG)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'equon-ach-'))
  db = createTestDb()
  credentials = { steamId: STEAM_ID, steamKey: KEY }
  requested = []
  waits = []
  broken = new Set()
  clock = new Date('2026-11-04T12:00:00Z')
  sync = createAchievementSync({
    games: games(),
    achievements: achievements(),
    users: users(),
    uow: createUnitOfWork(db),
    get,
    getBytes,
    credentials: () => credentials,
    cacheDir: dir,
    decode: () => ({ width: 64, height: 64 }),
    clock: { now: () => clock },
    wait: async (ms) => {
      waits.push(ms)
    },
    onChanged: () => {}
  })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

const addSteam = (appId: number, title: string): number =>
  games().upsertSteamGame({ steamAppId: appId, title }).id
const queryDeps = (): Parameters<typeof getGameAchievements>[0] => ({
  games: games(),
  origins: createOriginRepository(db),
  artwork: createArtworkRepository(db),
  achievements: achievements(),
  users: users(),
  isStale: (id) => sync.isStale(id),
  cacheDir: dir
})

describe('full sync', () => {
  it('imports every Steam game, computes tiers and counters, and is idempotent', async () => {
    const partial = addSteam(300, 'Partial')
    const platinum = addSteam(200, 'Complete')
    games().create({ origin: 'manual', title: 'Manual' })

    await sync.syncAll()

    expect(
      achievements()
        .listUnlocked(partial)
        .map((a) => [a.apiName, a.tier])
    ).toEqual([['RARE', 'gold']])
    expect(
      achievements()
        .listLocked(partial)
        .map((a) => [a.apiName, a.tier, a.globalPercent])
    ).toEqual([
      ['MID', 'silver', 30],
      ['COMMON', 'bronze', null]
    ])
    expect(achievements().progress(platinum).platinum).toBe(true)
    const counters = { platine: 1, gold: 2, silver: 1, bronze: 1 }
    expect(users().getTrophyCounters()).toEqual(counters)

    const rows = db.prepare('SELECT count(*) AS c FROM achievements').get()
    await sync.syncAll()
    expect(db.prepare('SELECT count(*) AS c FROM achievements').get()).toEqual(rows)
    expect(users().getTrophyCounters()).toEqual(counters)
    // Manual games are never requested.
    expect(requested.every((u) => /(appid|gameid)=(200|300)/.test(u))).toBe(true)
  })

  it('isolates a failing game and keeps its last good data', async () => {
    const good = addSteam(300, 'Good')
    const flaky = addSteam(400, 'Flaky')
    await sync.syncAll()
    const before = achievements().listUnlocked(flaky)

    broken.add(400)
    const status = await sync.syncAll()

    expect(status).toMatchObject({
      running: false,
      done: 2,
      total: 2,
      failures: [{ title: 'Flaky', reason: 'network' }]
    })
    expect(achievements().listUnlocked(flaky)).toEqual(before)
    expect(sync.isStale(flaky)).toBe(true)
    expect(sync.isStale(good)).toBe(false)
    expect(getGameAchievements(queryDeps(), flaky)?.stale).toBe(true)

    broken.clear()
    await sync.syncAll()
    expect(sync.isStale(flaky)).toBe(false)
  })

  it('changes nothing when any of the three requests fails', async () => {
    const id = addSteam(300, 'Game')
    const failOn =
      (part: string): HttpGet =>
      async (url) =>
        url.includes(part) ? { status: 500, json: null } : get(url)
    for (const part of ['GetPlayerAchievements', 'GetGlobalAchievementPercentages']) {
      const local = createAchievementSync({
        games: games(),
        achievements: achievements(),
        users: users(),
        uow: createUnitOfWork(db),
        get: failOn(part),
        getBytes,
        credentials: () => credentials,
        cacheDir: dir,
        decode: () => null,
        clock: { now: () => clock },
        wait: async () => {},
        onChanged: () => {}
      })
      await local.syncAll()
      expect(achievements().progress(id).total).toBe(0)
      expect(games().getById(id)?.achievementsSyncedAt).toBeNull()
    }
  })

  it('tells a game without achievements from one never synced', async () => {
    const none = addSteam(100, 'No achievements')
    expect(getGameAchievements(queryDeps(), none)?.status).toBe('never-synced')
    await sync.syncAll()
    expect(getGameAchievements(queryDeps(), none)?.status).toBe('none')
    // No player request: Steam answers with an error for games without stats.
    expect(requested.filter((u) => u.includes('GetPlayerAchievements'))).toEqual([])
    const manual = games().create({ origin: 'manual', title: 'M' }).id
    expect(getGameAchievements(queryDeps(), manual)?.status).toBe('none')
  })

  it('reports missing credentials per game without touching anything', async () => {
    addSteam(300, 'Game')
    credentials = { steamId: null, steamKey: KEY }
    expect((await sync.syncAll()).failures).toEqual([{ title: 'Game', reason: 'not-configured' }])
    expect(requested).toEqual([])
  })
})

describe('sync after a game closes', () => {
  it('waits for Steam and syncs only that game', async () => {
    const closed = addSteam(300, 'Closed')
    const other = addSteam(200, 'Other')
    await sync.syncAfterClose(closed)
    expect(waits).toEqual([AFTER_CLOSE_DELAY_MS])
    expect(achievements().progress(closed).total).toBe(3)
    expect(achievements().progress(other).total).toBe(0)
    expect(requested.some((u) => /(appid|gameid)=200/.test(u))).toBe(false)
  })

  it('is silent without credentials and ignores non-Steam games', async () => {
    const id = addSteam(300, 'Game')
    credentials = { steamId: null, steamKey: null }
    await sync.syncAfterClose(id)
    expect(requested).toEqual([])
    expect(sync.isStale(id)).toBe(false)

    credentials = { steamId: STEAM_ID, steamKey: KEY }
    await sync.syncAfterClose(games().create({ origin: 'manual', title: 'M' }).id)
    expect(requested).toEqual([])
  })
})

describe('overview and game queries', () => {
  it('lists games with achievements, hidden ones too, and totals count platinum', async () => {
    const hidden = addSteam(200, 'Hidden platinum')
    games().setFlags(hidden, { hidden: true })
    addSteam(300, 'Partial')
    addSteam(100, 'No achievements')
    await sync.syncAll()

    const overview = getAchievementsOverview(queryDeps())
    expect(achievementsOverviewSchema.safeParse(overview).success).toBe(true)
    expect(overview.neverSynced).toBe(false)
    expect(overview.games.map((g) => [g.title, g.unlocked, g.total, g.hidden, g.platinum])).toEqual(
      [
        ['Hidden platinum', 3, 3, true, true],
        ['Partial', 1, 3, false, false]
      ]
    )
    expect(overview.trophies).toEqual({ platine: 1, gold: 2, silver: 1, bronze: 1 })
    expect(overview.total).toBe(5)
  })

  it('says when nothing was synced yet', () => {
    addSteam(300, 'Game')
    expect(getAchievementsOverview(queryDeps())).toMatchObject({ neverSynced: true, games: [] })
  })

  it('reports the game totals by tier and platinum', async () => {
    const id = addSteam(200, 'Complete')
    await sync.syncAll()
    expect(getGameAchievements(queryDeps(), id)).toMatchObject({
      status: 'ready',
      unlockedCount: 3,
      total: 3,
      percent: 100,
      platinum: true,
      trophies: { platine: 1, gold: 1, silver: 1, bronze: 1 }
    })
    expect(getGameAchievements(queryDeps(), 9999)).toBeNull()
  })
})

describe('icons', () => {
  it('downloads missing icons on request only, skipping failures', async () => {
    const id = addSteam(300, 'Game')
    await sync.syncAll()
    const rows = [...achievements().listUnlocked(id), ...achievements().listLocked(id)]
    expect(rows.every((r) => achievementIconPath(dir, id, r.id, !r.unlocked) === null)).toBe(true)
    fetchedImages.length = 0
    expect(existsSync(join(dir, String(id)))).toBe(false)

    await sync.ensureIcons(id)

    const details = getGameAchievements(queryDeps(), id)
    const items = [...(details?.unlocked ?? []), ...(details?.locked ?? [])]
    expect(items.map((i) => [i.name, i.iconCached]).sort()).toEqual([
      ['COMMON', true],
      ['MID', false],
      ['RARE', true]
    ])
    // Unlocked art for what is unlocked, Steam's locked art for the rest.
    expect(fetchedImages.map((u) => u.split('/').pop()).sort()).toEqual([
      'COMMON-gray.png',
      'MID-gray.png',
      'RARE.png'
    ])
  })
})
