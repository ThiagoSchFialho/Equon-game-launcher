import type {
  AchievementRepository,
  ArtworkRepository,
  GameRepository,
  OriginRepository,
  UserRepository
} from '../../core/application'
import { BuiltinOrigin, type Achievement } from '../../core/domain'
import { achievementIconPath } from '../../infrastructure/artwork/achievement-icons'
import type {
  AchievementItem,
  AchievementsOverview,
  GameAchievements,
  TrophyTotals
} from '../../shared/ipc/contract'

export interface AchievementQueryDeps {
  games: GameRepository
  origins: OriginRepository
  artwork: ArtworkRepository
  achievements: AchievementRepository
  users: UserRepository
  isStale(gameId: number): boolean
  cacheDir: string
}

/**
 * Achievements overview (PRODUCT.md §6.8): games with known achievements,
 * hidden ones included (owner decision, Phase 7). Totals are the USERS
 * counters, recomputed from ACHIEVEMENTS on every sync; the renderer picks the
 * sort order.
 */
export function getAchievementsOverview(deps: AchievementQueryDeps): AchievementsOverview {
  const names = new Map(deps.origins.list().map((o) => [o.key, o.name]))
  const kinds = deps.artwork.listKinds()
  const trophies = deps.users.getTrophyCounters()
  const games: AchievementsOverview['games'] = []
  let neverSynced = true

  for (const game of deps.games.list()) {
    if (game.achievementsSyncedAt !== null) neverSynced = false
    const progress = deps.achievements.progress(game.id)
    if (progress.total === 0) continue
    games.push({
      id: game.id,
      title: game.title,
      originName: names.get(game.origin) ?? game.origin,
      hidden: game.hidden,
      timeLastPlayed: game.timeLastPlayed,
      artwork: kinds.get(game.id) ?? [],
      unlocked: progress.unlocked,
      total: progress.total,
      percent: progress.percent ?? 0,
      platinum: progress.platinum
    })
  }

  return {
    // The owner's definition: the total also counts platinum games.
    total: trophies.platine + trophies.gold + trophies.silver + trophies.bronze,
    trophies,
    games,
    neverSynced
  }
}

/** One game's achievements; lists keep the repository's presentation order (§3.4). */
export function getGameAchievements(
  deps: AchievementQueryDeps,
  id: number
): GameAchievements | null {
  const game = deps.games.getById(id)
  if (!game) return null
  const progress = deps.achievements.progress(id)
  const unlocked = deps.achievements.listUnlocked(id)
  const toItem = (row: Achievement): AchievementItem => ({
    id: row.id,
    name: row.displayName,
    description: row.description,
    unlockedAt: row.unlockedAt,
    globalPercent: row.globalPercent,
    tier: row.tier,
    iconCached: achievementIconPath(deps.cacheDir, id, row.id, !row.unlocked) !== null
  })
  const trophies: TrophyTotals = {
    platine: progress.platinum ? 1 : 0,
    gold: 0,
    silver: 0,
    bronze: 0
  }
  for (const row of unlocked) trophies[row.tier]++

  const neverSynced = game.origin === BuiltinOrigin.steam && game.achievementsSyncedAt === null
  return {
    id,
    title: game.title,
    status: progress.total > 0 ? 'ready' : neverSynced ? 'never-synced' : 'none',
    stale: deps.isStale(id),
    unlockedCount: progress.unlocked,
    total: progress.total,
    percent: progress.percent,
    platinum: progress.platinum,
    trophies,
    unlocked: unlocked.map(toItem),
    locked: deps.achievements.listLocked(id).map(toItem)
  }
}
