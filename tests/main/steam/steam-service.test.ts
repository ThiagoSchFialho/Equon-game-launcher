import { describe, expect, it } from 'vitest'
import { createSteamSessions, type DiscoveryResult } from '../../../src/core/application'
import type { SteamAdapter } from '../../../src/integrations/steam/steam-adapter'
import {
  createGameRepository,
  createSessionRepository,
  createUnitOfWork
} from '../../../src/infrastructure/persistence'
import { createSteamService } from '../../../src/main/steam/steam-service'
import { createTestDb } from '../../helpers/db'

describe('steam service: duplicate review', () => {
  it('keeps candidates from scans until dismissed, hidden or removed', async () => {
    const db = createTestDb()
    const games = createGameRepository(db)
    const uow = createUnitOfWork(db)
    let result: DiscoveryResult = { status: 'complete', games: [] }
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
      readGame: async () => null
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
      onLibraryChanged: () => {}
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
  })
})
