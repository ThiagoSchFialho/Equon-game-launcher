import { describe, expect, it } from 'vitest'
import {
  planDiscovery,
  runDiscovery,
  type DiscoveredGame,
  type DiscoveryResult,
  type IntegrationAdapter
} from '../../../src/core/application'
import { titleMatchKey, type Game } from '../../../src/core/domain'

const game = (id: number, extra: Partial<Game>): Game => ({
  id,
  origin: 'steam',
  steamAppId: null,
  title: `Game ${id}`,
  description: null,
  developer: null,
  releaseDate: null,
  timeLastPlayed: null,
  hidden: false,
  installed: true,
  playtime: 0,
  playtimeOffset: 0,
  beated: false,
  requiredAge: null,
  metadataFetchedAt: null,
  achievementsSyncedAt: null,
  ...extra
})

const found = (externalId: string, title: string): DiscoveredGame => ({
  externalId,
  title,
  installed: true
})

const existing = [
  game(1, { steamAppId: 620, title: 'Portal 2' }),
  game(2, { steamAppId: 400, title: 'Portal', installed: false }),
  game(3, { origin: 'manual', title: 'Hollow Knight™' }),
  game(4, { origin: 'manual', title: 'Celeste' })
]
const appIdOf = (g: Game): string | null => (g.steamAppId === null ? null : String(g.steamAppId))

const plan = (result: DiscoveryResult): ReturnType<typeof planDiscovery> =>
  planDiscovery('steam', result, existing, appIdOf)

describe('planDiscovery', () => {
  it('changes nothing when the scan failed', () => {
    expect(plan({ status: 'failed', reason: 'no steam' })).toEqual({
      upserts: [],
      installChanges: [],
      duplicates: []
    })
  })

  it('marks absent games not installed only after a complete scan', () => {
    const games = [found('367520', 'Hollow Knight')]
    expect(plan({ status: 'complete', games }).installChanges).toEqual([
      { gameId: 1, installed: false }
    ])
    // A partial scan makes absent games unknown, never "not installed".
    expect(plan({ status: 'partial', games, reason: 'D: offline' }).installChanges).toEqual([
      { gameId: 1, installed: null },
      { gameId: 2, installed: null }
    ])
  })

  it('upserts what was found and is idempotent for known games', () => {
    const games = [found('620', 'Portal 2'), found('400', 'Portal')]
    const result = plan({ status: 'complete', games })
    expect(result.upserts).toEqual(games)
    expect(result.installChanges).toEqual([])
    expect(result.duplicates).toEqual([])
  })

  it('reports title matches with other origins as candidates, never merging them', () => {
    const games = [
      found('367520', 'HOLLOW KNIGHT'),
      found('504230', 'Celeste'),
      found('1', 'Other')
    ]
    const result = plan({ status: 'complete', games })
    expect(result.duplicates).toEqual([
      { discovered: games[0], existingGameId: 3 },
      { discovered: games[1], existingGameId: 4 }
    ])
    expect(result.upserts).toEqual(games)
  })
})

describe('runDiscovery', () => {
  const adapter = (discover: IntegrationAdapter['discover']): IntegrationAdapter => ({
    source: 'steam',
    capabilities: {
      installState: true,
      launch: true,
      playtime: true,
      achievements: true,
      metadata: true
    },
    discover
  })

  it('turns a throwing adapter into a failed result', async () => {
    expect(
      await runDiscovery(
        adapter(async () => {
          throw new Error('registry unreadable')
        })
      )
    ).toEqual({ status: 'failed', reason: 'registry unreadable' })
  })

  it('passes results through', async () => {
    const result: DiscoveryResult = { status: 'complete', games: [] }
    expect(await runDiscovery(adapter(async () => result))).toBe(result)
  })
})

describe('titleMatchKey', () => {
  it('ignores case, accents, trademark signs and punctuation', () => {
    expect(titleMatchKey('Pokémon™: Red')).toBe(titleMatchKey('pokemon red'))
    expect(titleMatchKey('  Half-Life®  2 ')).toBe('half life 2')
    expect(titleMatchKey('™')).toBe('')
  })
})
