import type { AchievementGameSummary } from './ipc/contract'

export type AchievementSort = 'recent' | 'completion'

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })
const byTitle = (a: AchievementGameSummary, b: AchievementGameSummary): number =>
  collator.compare(a.title, b.title) || a.id - b.id

/** Last session descending, unknown last (PRODUCT.md §6.8). */
const byRecent = (a: AchievementGameSummary, b: AchievementGameSummary): number => {
  if (a.timeLastPlayed === b.timeLastPlayed) return byTitle(a, b)
  if (a.timeLastPlayed === null) return 1
  if (b.timeLastPlayed === null) return -1
  return b.timeLastPlayed.localeCompare(a.timeLastPlayed)
}

const SORTS: Record<
  AchievementSort,
  (a: AchievementGameSummary, b: AchievementGameSummary) => number
> = {
  recent: byRecent,
  completion: (a, b) => b.percent - a.percent || byRecent(a, b)
}

export function sortAchievementGames(
  games: readonly AchievementGameSummary[],
  sort: AchievementSort
): AchievementGameSummary[] {
  return [...games].sort(SORTS[sort])
}
