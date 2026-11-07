import { beforeEach, describe, expect, it } from 'vitest'
import {
  getGameDetails,
  listGameSummaries,
  type GameQueryDeps
} from '../../../src/main/ipc/game-queries'
import {
  createAchievementRepository,
  createArtworkRepository,
  createEmulatorRepository,
  createGameRepository,
  createGenreRepository,
  createLaunchConfigRepository,
  createOriginRepository
} from '../../../src/infrastructure/persistence'
import type { AchievementUpsert } from '../../../src/core/application'
import { gameDetailsSchema, gameSummaryListSchema } from '../../../src/shared/ipc/schemas'
import { createTestDb } from '../../helpers/db'

let deps: GameQueryDeps
const steamLive = new Map<number, 'updating' | 'paused' | 'update-required' | 'unhealthy' | null>()

beforeEach(() => {
  const db = createTestDb()
  deps = {
    games: createGameRepository(db),
    origins: createOriginRepository(db),
    artwork: createArtworkRepository(db),
    genres: createGenreRepository(db),
    achievements: createAchievementRepository(db),
    configs: createLaunchConfigRepository(db),
    emulators: createEmulatorRepository(db),
    inspector: { stateOf: () => 'file' },
    steamLiveState: (appId) => steamLive.get(appId) ?? null
  }
})

describe('game queries', () => {
  it('lists every game, hidden ones flagged, with origin names and artwork kinds, matching the IPC schema', () => {
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

    expect(list).toEqual(
      [
        {
          id: shown.id,
          title: 'Shown',
          origin: 'ps2',
          originName: 'PlayStation 2',
          installed: null,
          playtime: 0,
          timeLastPlayed: null,
          beated: false,
          hidden: false,
          artwork: ['cover_square'],
          artworkVersion: null,
          achievementPercent: null
        },
        {
          id: hidden.id,
          title: 'Hidden',
          origin: 'manual',
          originName: 'Jogo Local',
          installed: null,
          playtime: 0,
          timeLastPlayed: null,
          beated: false,
          hidden: true,
          artwork: [],
          artworkVersion: null,
          achievementPercent: null
        }
      ].sort((a, b) => a.title.localeCompare(b.title))
    )
    expect(gameSummaryListSchema.safeParse(list).success).toBe(true)
  })

  it('lists the achievement percentage, telling 0% from no known achievements', () => {
    const achievement = (apiName: string, unlocked: boolean): AchievementUpsert => ({
      apiName,
      displayName: apiName,
      description: null,
      icon: null,
      unlocked,
      unlockedAt: null,
      globalPercent: 10,
      tier: 'gold'
    })
    const half = deps.games.create({ origin: 'manual', title: 'Half' })
    const zero = deps.games.create({ origin: 'manual', title: 'Zero' })
    const none = deps.games.create({ origin: 'manual', title: 'None' })
    deps.achievements.upsertForGame(half.id, [achievement('A', true), achievement('B', false)])
    deps.achievements.upsertForGame(zero.id, [achievement('A', false)])

    const list = listGameSummaries(deps)
    const percent = (id: number): number | null | undefined =>
      list.find((g) => g.id === id)?.achievementPercent

    expect(percent(half.id)).toBe(deps.achievements.progress(half.id).percent)
    expect(percent(half.id)).toBeGreaterThan(0)
    expect(percent(zero.id)).toBe(0)
    expect(percent(none.id)).toBeNull()
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

  it('offers Play for installed Steam games unless Steam is busy with them', () => {
    const game = deps.games.upsertSteamGame({ steamAppId: 620, title: 'Portal 2' })
    expect(getGameDetails(deps, game.id)).toMatchObject({
      launchIssue: 'install-unknown',
      tracksTime: true
    })
    deps.games.setInstalled(game.id, false)
    expect(getGameDetails(deps, game.id)?.launchIssue).toBe('not-installed')
    deps.games.setInstalled(game.id, true)
    expect(getGameDetails(deps, game.id)).toMatchObject({ launchIssue: null, launchable: true })
    steamLive.set(620, 'update-required')
    expect(getGameDetails(deps, game.id)?.launchIssue).toBeNull()
    steamLive.set(620, 'updating')
    expect(getGameDetails(deps, game.id)?.launchIssue).toBe('steam-busy')
    steamLive.clear()
  })

  it('reports no achievement summary when none are known', () => {
    const game = deps.games.create({ origin: 'manual', title: 'Solo' })
    expect(getGameDetails(deps, game.id)?.achievements).toBeNull()
  })
})
