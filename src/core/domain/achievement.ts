export type Tier = 'bronze' | 'silver' | 'gold'

export interface Achievement {
  id: number
  gameId: number
  apiName: string
  displayName: string
  description: string | null
  icon: string | null
  /** Steam's own art for the locked state; not always a grey copy of `icon`. */
  iconLocked: string | null
  unlocked: boolean
  /** ISO-8601 UTC */
  unlockedAt: string | null
  /** Percentage (15.0 = 15%); null when unknown, never 0 for missing data. */
  globalPercent: number | null
  tier: Tier
}

/** D-09: <= 15 gold, (15, 50) silver, >= 50 bronze, unknown bronze. */
export function tierFromGlobalPercent(globalPercent: number | null): Tier {
  if (globalPercent === null) return 'bronze'
  if (globalPercent <= 15) return 'gold'
  if (globalPercent < 50) return 'silver'
  return 'bronze'
}

/** Platinum: at least one known achievement and every known achievement unlocked. */
export function isPlatinum(achievements: readonly { unlocked: boolean }[]): boolean {
  return achievements.length > 0 && achievements.every((a) => a.unlocked)
}

/** unlocked / total × 100, or null ("unavailable") when no achievement is known. */
export function personalProgressPercent(unlocked: number, total: number): number | null {
  if (total <= 0) return null
  return (unlocked / total) * 100
}
