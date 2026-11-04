import { beforeEach, describe, expect, it } from 'vitest'
import {
  createSteamSessions,
  refreshSteamLibrary,
  type DiscoveryResult,
  type IntegrationAdapter,
  type SteamSessions
} from '../../../src/core/application'
import {
  createGameRepository,
  createSessionRepository,
  createUnitOfWork,
  type SqliteDatabase
} from '../../../src/infrastructure/persistence'
import { createTestDb } from '../../helpers/db'

let db: SqliteDatabase
beforeEach(() => {
  db = createTestDb()
})

const games = (): ReturnType<typeof createGameRepository> => createGameRepository(db)
const adapter = (result: DiscoveryResult | Error): IntegrationAdapter => ({
  source: 'steam',
  capabilities: {
    installState: true,
    launch: true,
    playtime: true,
    achievements: true,
    metadata: true
  },
  discover: async () => {
    if (result instanceof Error) throw result
    return result
  }
})
const refresh = (result: DiscoveryResult | Error): ReturnType<typeof refreshSteamLibrary> =>
  refreshSteamLibrary({ games: games(), uow: createUnitOfWork(db) }, adapter(result))

describe('refreshSteamLibrary', () => {
  it('adds discovered games with their install state and is idempotent', async () => {
    const result: DiscoveryResult = {
      status: 'complete',
      games: [
        { externalId: '2379780', title: 'Balatro', installed: true },
        { externalId: '730', title: 'Counter-Strike 2', installed: false }
      ]
    }
    expect(await refresh(result)).toMatchObject({ status: 'complete', added: 2, missing: 0 })
    expect(games().findBySteamAppId(2379780)).toMatchObject({ title: 'Balatro', installed: true })
    expect(games().findBySteamAppId(730)?.installed).toBe(false)
    expect(await refresh(result)).toMatchObject({ added: 0, missing: 0, unknown: 0 })
    expect(games().list()).toHaveLength(2)
  })

  it('keeps manual flags and marks absent games by scan completeness', async () => {
    await refresh({
      status: 'complete',
      games: [{ externalId: '620', title: 'Portal 2', installed: true }]
    })
    const id = games().findBySteamAppId(620)!.id
    games().setFlags(id, { hidden: true, beated: true })

    expect(
      await refresh({ status: 'partial', games: [], reason: 'library-unreadable' })
    ).toMatchObject({
      unknown: 1
    })
    expect(games().getById(id)).toMatchObject({ installed: null, hidden: true, beated: true })

    expect(await refresh({ status: 'complete', games: [] })).toMatchObject({ missing: 1 })
    expect(games().getById(id)).toMatchObject({ installed: false, hidden: true, beated: true })
  })

  it('changes nothing when the scan fails or the adapter throws', async () => {
    await refresh({
      status: 'complete',
      games: [{ externalId: '620', title: 'P', installed: true }]
    })
    expect(await refresh({ status: 'failed', reason: 'steam-not-found' })).toMatchObject({
      status: 'failed',
      reason: 'steam-not-found'
    })
    expect(await refresh(new Error('boom'))).toMatchObject({ status: 'failed', reason: 'boom' })
    expect(games().findBySteamAppId(620)?.installed).toBe(true)
  })

  it('reports title matches with manual games without merging them', async () => {
    games().create({ origin: 'manual', title: 'Balatro' })
    const summary = await refresh({
      status: 'complete',
      games: [{ externalId: '2379780', title: 'Balatro', installed: true }]
    })
    expect(summary.duplicates).toHaveLength(1)
    expect(games().list()).toHaveLength(2)
  })
})

describe('createSteamSessions', () => {
  let clock: Date
  let changes: number
  let sessions: SteamSessions
  let timeouts: (() => void)[]

  beforeEach(() => {
    clock = new Date('2026-11-03T22:05:42Z')
    changes = 0
    timeouts = []
    sessions = createSteamSessions({
      games: games(),
      sessions: createSessionRepository(db),
      uow: createUnitOfWork(db),
      clock: { now: () => clock },
      repeat: () => () => {},
      after: (_ms, fn) => {
        timeouts.push(fn)
        return () => (timeouts = timeouts.filter((t) => t !== fn))
      },
      heartbeatMs: 30_000,
      onChange: () => changes++
    })
  })

  const balatro = (): number => {
    const game = games().upsertSteamGame({ steamAppId: 2379780, title: 'Balatro' })
    games().setInstalled(game.id, true)
    return game.id
  }

  it('opens a session when RunningAppID shows a library game and closes it at 0', () => {
    const id = balatro()
    sessions.observe(2379780)
    sessions.observe(2379780) // repeated polls change nothing
    expect(sessions.runningGameId()).toBe(id)
    expect(changes).toBe(1)

    clock = new Date('2026-11-03T22:06:58Z')
    sessions.observe(0)
    expect(sessions.runningGameId()).toBeNull()
    expect(createSessionRepository(db).listRunning()).toEqual([])
    // 76 s observed: the Steam baseline is 0, so 1 minute.
    expect(games().getById(id)).toMatchObject({
      playtime: 1,
      timeLastPlayed: '2026-11-03T22:06:58Z'
    })
  })

  it('ignores apps outside the library and switches sessions when the app changes', () => {
    const id = balatro()
    sessions.observe(999)
    expect(sessions.runningGameId()).toBeNull()
    sessions.observe(2379780)
    expect(sessions.runningGameId()).toBe(id)
    sessions.observe(null)
    expect(sessions.runningGameId()).toBeNull()
  })

  it('resolves waiters on start and times out otherwise', async () => {
    balatro()
    const started = sessions.waitForStart(2379780, 90_000)
    sessions.observe(2379780)
    expect(await started).toBe(true)
    expect(await sessions.waitForStart(2379780, 90_000)).toBe(true)

    const late = sessions.waitForStart(730, 90_000)
    timeouts.forEach((fire) => fire())
    expect(await late).toBe(false)
  })
})
