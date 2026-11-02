import { beforeEach, describe, expect, it } from 'vitest'
import {
  getGameDetails,
  listGameSummaries,
  type GameQueryDeps
} from '../../../src/main/ipc/game-queries'
import {
  createAchievementRepository,
  createArtworkRepository,
  createGameRepository,
  createGenreRepository,
  createOriginRepository
} from '../../../src/infrastructure/persistence'
import { gameDetailsSchema, gameSummaryListSchema } from '../../../src/shared/ipc/schemas'
import { createTestDb } from '../../helpers/db'

let deps: GameQueryDeps

beforeEach(() => {
  const db = createTestDb()
  deps = {
    games: createGameRepository(db),
    origins: createOriginRepository(db),
    artwork: createArtworkRepository(db),
    genres: createGenreRepository(db),
    achievements: createAchievementRepository(db)
  }
})

describe('game queries', () => {
  it('lists visible games with origin names and artwork kinds, matching the IPC schema', () => {
    const shown = deps.games.create({ origin: 'ps2', title: 'Shown' })
    const hidden = deps.games.create({ origin: 'manual', title: 'Hidden' })
    deps.games.setFlags(hidden.id, { hidden: true })
    deps.artwork.save({
      gameId: shown.id,
      kind: 'cover_square',
      localPath: `${shown.id}/c.png`,
      source: 'user',
      sourceUrl: null,
      width: 600,
      height: 600,
      userSelected: true,
      fetchedAt: null
    })

    const list = listGameSummaries(deps)

    expect(list).toEqual([
      {
        id: shown.id,
        title: 'Shown',
        origin: 'ps2',
        originName: 'PlayStation 2',
        installed: null,
        playtime: 0,
        timeLastPlayed: null,
        beated: false,
        artwork: ['cover_square']
      }
    ])
    expect(gameSummaryListSchema.safeParse(list).success).toBe(true)
  })

  it('returns details with genres and achievements, or null', () => {
    const game = deps.games.upsertSteamGame({
      steamAppId: 620,
      title: 'Portal 2',
      developer: 'Valve',
      requiredAge: '10'
    })
    deps.genres.setGameGenres(game.id, ['Puzzle'])
    deps.achievements.upsertForGame(game.id, [
      {
        apiName: 'A',
        displayName: 'A',
        description: null,
        icon: null,
        unlocked: true,
        unlockedAt: null,
        globalPercent: 10,
        tier: 'gold'
      }
    ])

    const details = getGameDetails(deps, game.id)

    expect(details).toMatchObject({
      title: 'Portal 2',
      originName: 'Steam',
      developer: 'Valve',
      requiredAge: '10',
      genres: ['Puzzle'],
      achievements: { total: 1, unlocked: 1, platinum: true }
    })
    expect(gameDetailsSchema.safeParse(details).success).toBe(true)
    expect(getGameDetails(deps, 9999)).toBeNull()
  })

  it('reports no achievement summary when none are known', () => {
    const game = deps.games.create({ origin: 'manual', title: 'Solo' })
    expect(getGameDetails(deps, game.id)?.achievements).toBeNull()
  })
})
