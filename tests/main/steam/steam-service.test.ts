import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSteamSessions, type DiscoveryResult } from '../../../src/core/application'
import type { SteamAdapter } from '../../../src/integrations/steam/steam-adapter'
import {
  createGameRepository,
  createSessionRepository,
  createSteamIgnoredRepository,
  createUnitOfWork
} from '../../../src/infrastructure/persistence'
import type { OwnedSyncOutcome } from '../../../src/core/application'
import { createSteamService, RESCAN_MS } from '../../../src/main/steam/steam-service'
import { createTestDb } from '../../helpers/db'

describe('steam service: duplicate review', () => {
  it('keeps candidates from scans until dismissed, hidden or removed', async () => {
    const db = createTestDb()
    const games = createGameRepository(db)
    const uow = createUnitOfWork(db)
    let result: DiscoveryResult = { status: 'complete', games: [] }
    const ownedCalls: { first: boolean; scanComplete: boolean }[] = []
    const refreshes: boolean[] = []
    let owned = (): OwnedSyncOutcome => ({ added: 0, duplicates: [], error: null })
    const adapter = {
      source: 'steam',
      capabilities: {
        installState: true,
        launch: true,
        playtime: true,
        achievements: true,
        metadata: true
      },
      discover: async () => result,
      steamPath: () => null,
      libraries: () => [],
      liveState: () => null,
      readGame: async () => null,
      installedSizes: async () => new Map()
    } satisfies SteamAdapter
    const service = createSteamService({
      games,
      uow,
      adapter,
      sessions: createSteamSessions({
        games,
        sessions: createSessionRepository(db),
        uow,
        clock: { now: () => new Date() },
        repeat: () => () => {},
        after: () => () => {},
        heartbeatMs: 30_000,
        onChange: () => {}
      }),
      readRunningAppId: async () => null,
      clock: { now: () => new Date('2026-11-04T03:00:00Z') },
      onLibraryChanged: () => {},
      isGameRunning: () => false,
      onRefreshing: (value) => refreshes.push(value),
      syncOwned: async (options) => {
        ownedCalls.push(options)
        return owned()
      }
    })

    const balatro = games.create({ origin: 'manual', title: 'Balatro' }).id
    const celeste = games.create({ origin: 'manual', title: 'Celeste' }).id
    result = {
      status: 'complete',
      games: [
        { externalId: '2379780', title: 'Balatro', installed: true },
        { externalId: '504230', title: 'Celeste', installed: true }
      ]
    }
    expect(await service.refresh()).toMatchObject({ duplicates: 2 })
    expect(refreshes).toEqual([true, false])
    expect(service.duplicates()).toEqual([
      { manualGameId: balatro, manualTitle: 'Balatro', steamTitle: 'Balatro' },
      { manualGameId: celeste, manualTitle: 'Celeste', steamTitle: 'Celeste' }
    ])

    // Known Steam games never come back as candidates on later scans.
    expect(await service.refresh()).toMatchObject({ duplicates: 2 })
    service.dismissDuplicate(balatro)
    games.setFlags(celeste, { hidden: true })
    expect(service.duplicates()).toEqual([])
    expect(games.list()).toHaveLength(4) // nothing was merged

    // The owned-games step runs in every refresh; only the first one is the startup one.
    expect(ownedCalls.slice(0, 2)).toEqual([
      { first: true, scanComplete: true },
      { first: false, scanComplete: true }
    ])

    // Its games and candidates join the scan's; an error does not fail the refresh.
    const other = games.create({ origin: 'manual', title: 'Doom' }).id
    owned = () => ({
      added: 3,
      duplicates: [
        { discovered: { externalId: '1', title: 'Doom', installed: false }, existingGameId: other }
      ],
      error: null
    })
    expect(await service.refresh()).toMatchObject({ added: 3, duplicates: 1, ownedError: null })

    owned = () => {
      throw new Error('boom')
    }
    expect(await service.refresh()).toMatchObject({
      status: 'complete',
      added: 0,
      ownedError: 'invalid-response'
    })

    // Steam folder not found: nothing local, but owned games are still read as unknown.
    result = { status: 'failed', reason: 'steam-not-found' }
    owned = () => ({ added: 0, duplicates: [], error: null })
    expect(await service.refresh()).toMatchObject({ status: 'failed', reason: 'steam-not-found' })
    expect(ownedCalls[ownedCalls.length - 1]).toEqual({ first: false, scanComplete: false })
  })
})

describe('steam service: local check', () => {
  const STEAM = { externalId: '620', title: 'Portal 2' }
  let result: DiscoveryResult
  let running: boolean
  let changes: number
  let after: { retryArtwork: boolean }[]
  let discovered: number
  let games: ReturnType<typeof createGameRepository>
  let service: ReturnType<typeof createSteamService>

  const tick = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(RESCAN_MS)
  }
  const portal = (): ReturnType<typeof games.findBySteamAppId> => games.findBySteamAppId(620)

  beforeEach(async () => {
    vi.useFakeTimers()
    const db = createTestDb()
    games = createGameRepository(db)
    const uow = createUnitOfWork(db)
    result = { status: 'complete', games: [{ ...STEAM, installed: false }] }
    running = false
    discovered = 0
    service = createSteamService({
      games,
      uow,
      adapter: {
        source: 'steam',
        capabilities: {
          installState: true,
          launch: true,
          playtime: true,
          achievements: true,
          metadata: true
        },
        discover: async () => {
          discovered++
          return result
        },
        steamPath: () => null,
        libraries: () => [],
        liveState: () => null,
        readGame: async () => null,
        installedSizes: async () => new Map()
      } satisfies SteamAdapter,
      sessions: createSteamSessions({
        games,
        sessions: createSessionRepository(db),
        uow,
        clock: { now: () => new Date() },
        repeat: () => () => {},
        after: () => () => {},
        heartbeatMs: 30_000,
        onChange: () => {}
      }),
      readRunningAppId: async () => null,
      clock: { now: () => new Date('2026-11-05T03:00:00Z') },
      onLibraryChanged: () => changes++,
      isGameRunning: () => running,
      syncOwned: async () => ({ added: 0, duplicates: [], error: null }),
      afterRefresh: (options) => after.push(options)
    })
    service.start()
    await vi.advanceTimersByTimeAsync(0)
    changes = 0
    after = []
    discovered = 0
  })

  afterEach(() => {
    service.stop()
    vi.useRealTimers()
  })

  it('notices a game installed in Steam within one interval, with no network step', async () => {
    expect(portal()?.installed).toBe(false)
    result = { status: 'complete', games: [{ ...STEAM, installed: true }] }
    await tick()
    expect(portal()?.installed).toBe(true)
    expect(changes).toBe(1)
    expect(after).toEqual([]) // nothing new to fetch
  })

  it('notices a game removed in Steam', async () => {
    result = { status: 'complete', games: [{ ...STEAM, installed: true }] }
    await tick()
    result = { status: 'complete', games: [] }
    await tick()
    expect(portal()?.installed).toBe(false)
  })

  it('writes and announces nothing when nothing changed', async () => {
    const upsert = vi.spyOn(games, 'upsertSteamGame')
    const setInstalled = vi.spyOn(games, 'setInstalled')
    await tick()
    await tick()
    expect(discovered).toBe(2)
    expect(upsert).not.toHaveBeenCalled()
    expect(setInstalled).not.toHaveBeenCalled()
    expect(changes).toBe(0)
  })

  it('does not look while a game is running, and resumes after it closes', async () => {
    running = true
    result = { status: 'complete', games: [{ ...STEAM, installed: true }] }
    await tick()
    await service.rescan() // the window getting focus
    expect(discovered).toBe(0)
    expect(portal()?.installed).toBe(false)

    running = false
    await tick()
    expect(portal()?.installed).toBe(true)
  })

  it('a new game enters the library and gets its data, without retrying artwork', async () => {
    result = {
      status: 'complete',
      games: [
        { ...STEAM, installed: false },
        { externalId: '730', title: 'Counter-Strike 2', installed: true }
      ]
    }
    await tick()
    expect(games.findBySteamAppId(730)?.installed).toBe(true)
    expect(after).toEqual([{ retryArtwork: false }])
  })

  it('keeps the rules of a scan: a failed read changes nothing, a partial one means unknown', async () => {
    result = { status: 'complete', games: [{ ...STEAM, installed: true }] }
    await tick()

    result = { status: 'failed', reason: 'libraryfolders-unreadable' }
    await tick()
    expect(portal()?.installed).toBe(true)

    result = { status: 'partial', games: [], reason: 'library-unreadable' }
    await tick()
    expect(portal()?.installed).toBeNull()
  })

  it('does not touch hidden, beaten or a title that came from the store', async () => {
    const id = portal()?.id as number
    games.setFlags(id, { hidden: true, beated: true })
    games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2: Store Name' })
    result = { status: 'complete', games: [{ ...STEAM, installed: true }] }
    await tick()
    expect(games.getById(id)).toMatchObject({
      title: 'Portal 2: Store Name',
      hidden: true,
      beated: true,
      installed: true
    })
  })

  it('stops with the service', async () => {
    service.stop()
    await tick()
    expect(discovered).toBe(0)
  })
})

describe('steam service: removed games (D-26)', () => {
  it('brings back a plain removal only on the user refresh; an exception stays out', async () => {
    const db = createTestDb()
    const games = createGameRepository(db)
    const uow = createUnitOfWork(db)
    const ignored = createSteamIgnoredRepository(db)
    const result: DiscoveryResult = {
      status: 'complete',
      games: [
        { externalId: '620', title: 'Portal 2', installed: true },
        { externalId: '730', title: 'Counter-Strike 2', installed: true }
      ]
    }
    const at = '2026-11-08T12:00:00Z'
    ignored.add({ steamAppId: 620, title: 'Portal 2', ignoredAt: at }, { permanent: false })
    ignored.add({ steamAppId: 730, title: 'Counter-Strike 2', ignoredAt: at }, { permanent: true })
    const service = createSteamService({
      games,
      uow,
      ignored,
      adapter: {
        source: 'steam',
        capabilities: {
          installState: true,
          launch: true,
          playtime: true,
          achievements: true,
          metadata: true
        },
        discover: async () => result,
        steamPath: () => null,
        libraries: () => [],
        liveState: () => null,
        readGame: async () => null,
        installedSizes: async () => new Map()
      },
      sessions: createSteamSessions({
        games,
        sessions: createSessionRepository(db),
        uow,
        clock: { now: () => new Date() },
        repeat: () => () => {},
        after: () => () => {},
        heartbeatMs: 30_000,
        onChange: () => {}
      }),
      readRunningAppId: async () => null,
      clock: { now: () => new Date(at) },
      onLibraryChanged: () => {},
      isGameRunning: () => false,
      syncOwned: async () => ({ added: 0, duplicates: [], error: null })
    })
    const ids = (): (number | null)[] => games.list().map((g) => g.steamAppId)

    // The startup refresh and the local check keep both out.
    await service.refresh()
    expect(ids()).toEqual([])
    await service.rescan()
    expect(ids()).toEqual([])

    // "Atualizar biblioteca": the plain removal comes back, the exception does not.
    await service.refresh()
    expect(ids()).toEqual([620])
    expect([...ignored.appIds()]).toEqual([730])
    service.stop()
  })
})
