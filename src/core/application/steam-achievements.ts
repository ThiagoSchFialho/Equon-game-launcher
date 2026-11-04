import { tierFromGlobalPercent, type Game } from '../domain'
import type {
  AchievementRepository,
  AchievementUpsert,
  GameRepository,
  UnitOfWork,
  UserRepository
} from './ports'

/** The three Steam answers for one game, already validated by the adapter. */
export interface RemoteAchievements {
  definitions: readonly {
    apiName: string
    displayName: string
    description: string | null
    icon: string | null
    iconLocked: string | null
  }[]
  player: ReadonlyMap<string, { unlocked: boolean; unlockedAt: string | null }>
  /** Unknown percentages stay out of the map and become NULL, never 0. */
  percentages: ReadonlyMap<string, number>
}

/** Joins definitions, player state and global rates; the tier comes from the rate (D-09). */
export function toAchievementUpserts(remote: RemoteAchievements): AchievementUpsert[] {
  return remote.definitions.map((definition) => {
    const state = remote.player.get(definition.apiName)
    const globalPercent = remote.percentages.get(definition.apiName) ?? null
    return {
      ...definition,
      unlocked: state?.unlocked ?? false,
      unlockedAt: state?.unlockedAt ?? null,
      globalPercent,
      tier: tierFromGlobalPercent(globalPercent)
    }
  })
}

/**
 * Applies one successful sync in one transaction (DATA_BASE_CONTEXT.md §5):
 * upserts by (game_id, api_name), recomputes the trophy counters from
 * ACHIEVEMENTS and records when the game was synced. Callers only get here
 * after every request succeeded, so a failure never marks anything locked.
 * No definitions means the game has no achievements: nothing is deleted.
 */
export function applyGameAchievements(
  deps: {
    games: GameRepository
    achievements: AchievementRepository
    users: UserRepository
    uow: UnitOfWork
  },
  game: Game,
  remote: RemoteAchievements,
  syncedAt: string
): void {
  deps.uow.transaction(() => {
    deps.achievements.upsertForGame(game.id, toAchievementUpserts(remote))
    deps.users.recomputeTrophyCounters()
    deps.games.setAchievementsSynced(game.id, syncedAt)
  })
}
