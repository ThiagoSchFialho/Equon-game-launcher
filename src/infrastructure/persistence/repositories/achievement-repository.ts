import type { AchievementRepository } from '../../../core/application'
import { personalProgressPercent, type Achievement, type Tier } from '../../../core/domain'
import type { SqliteDatabase } from '../database'
import { toBit, toBool } from './rows'

interface AchievementRow {
  id: number
  game_id: number
  api_name: string
  display_name: string
  description: string | null
  icon: string | null
  unlocked: number
  unlocked_at: string | null
  global_percent: number | null
  tier: Tier
}

const toAchievement = (row: AchievementRow): Achievement => ({
  id: row.id,
  gameId: row.game_id,
  apiName: row.api_name,
  displayName: row.display_name,
  description: row.description,
  icon: row.icon,
  unlocked: toBool(row.unlocked),
  unlockedAt: row.unlocked_at,
  globalPercent: row.global_percent,
  tier: row.tier
})

export function createAchievementRepository(db: SqliteDatabase): AchievementRepository {
  // The WHERE clause skips rows whose values are identical, so repeating a
  // sync with the same data changes nothing.
  const upsert = db.prepare<Record<string, unknown>>(`
    INSERT INTO achievements
      (game_id, api_name, display_name, description, icon, unlocked, unlocked_at, global_percent, tier)
    VALUES
      (@gameId, @apiName, @displayName, @description, @icon, @unlocked, @unlockedAt, @globalPercent, @tier)
    ON CONFLICT (game_id, api_name) DO UPDATE SET
      display_name   = excluded.display_name,
      description    = excluded.description,
      icon           = excluded.icon,
      unlocked       = excluded.unlocked,
      unlocked_at    = excluded.unlocked_at,
      global_percent = excluded.global_percent,
      tier           = excluded.tier
    WHERE (achievements.display_name, achievements.description, achievements.icon, achievements.unlocked,
           achievements.unlocked_at, achievements.global_percent, achievements.tier)
       IS NOT (excluded.display_name, excluded.description, excluded.icon, excluded.unlocked,
               excluded.unlocked_at, excluded.global_percent, excluded.tier)`)

  const selectUnlocked = db.prepare<[number], AchievementRow>(`
    SELECT * FROM achievements WHERE game_id = ? AND unlocked = 1
    ORDER BY unlocked_at IS NULL, unlocked_at DESC, display_name COLLATE NOCASE, api_name`)
  const selectLocked = db.prepare<[number], AchievementRow>(`
    SELECT * FROM achievements WHERE game_id = ? AND unlocked = 0
    ORDER BY global_percent IS NULL, global_percent DESC, display_name COLLATE NOCASE, api_name`)
  const selectCounts = db.prepare<[number], { total: number; unlocked: number }>(`
    SELECT count(*) AS total, coalesce(sum(unlocked), 0) AS unlocked
    FROM achievements WHERE game_id = ?`)

  const selectById = db.prepare<[number], AchievementRow>('SELECT * FROM achievements WHERE id = ?')

  return {
    getById: (id) => {
      const row = selectById.get(id)
      return row ? toAchievement(row) : null
    },

    upsertForGame: (gameId, achievements) =>
      db.transaction(() => {
        for (const a of achievements) {
          upsert.run({
            gameId,
            apiName: a.apiName,
            displayName: a.displayName,
            description: a.description,
            icon: a.icon,
            unlocked: toBit(a.unlocked),
            unlockedAt: a.unlockedAt,
            globalPercent: a.globalPercent,
            tier: a.tier
          })
        }
      })(),

    listUnlocked: (gameId) => selectUnlocked.all(gameId).map(toAchievement),

    listLocked: (gameId) => selectLocked.all(gameId).map(toAchievement),

    progress: (gameId) => {
      const { total, unlocked } = selectCounts.get(gameId) as { total: number; unlocked: number }
      return {
        total,
        unlocked,
        percent: personalProgressPercent(unlocked, total),
        platinum: total > 0 && unlocked === total
      }
    }
  }
}
