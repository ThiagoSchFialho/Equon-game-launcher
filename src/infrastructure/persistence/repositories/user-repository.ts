import type { TrophyCounters, UserRepository } from '../../../core/application'
import type { SqliteDatabase } from '../database'

const COUNTERS = 'platine, gold, silver, bronze'

export function createUserRepository(db: SqliteDatabase): UserRepository {
  const selectCounters = db.prepare<[], TrophyCounters>(
    `SELECT ${COUNTERS} FROM users WHERE id = 1`
  )

  // Counters mirror ACHIEVEMENTS: tiers count unlocked achievements; platine
  // counts games with at least one achievement and all of them unlocked.
  const recompute = db.prepare<[], TrophyCounters>(`
    UPDATE users SET
      gold    = (SELECT count(*) FROM achievements WHERE unlocked = 1 AND tier = 'gold'),
      silver  = (SELECT count(*) FROM achievements WHERE unlocked = 1 AND tier = 'silver'),
      bronze  = (SELECT count(*) FROM achievements WHERE unlocked = 1 AND tier = 'bronze'),
      platine = (SELECT count(*) FROM (
                   SELECT game_id FROM achievements GROUP BY game_id HAVING min(unlocked) = 1))
    WHERE id = 1
    RETURNING ${COUNTERS}`)

  return {
    getTrophyCounters: () => selectCounters.get() as TrophyCounters,
    recomputeTrophyCounters: () => recompute.get() as TrophyCounters
  }
}
