import type { AchievementGameSummary } from './ipc/contract'

export type AchievementSort = 'recent' | 'completion' | 'title'

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
  completion: (a, b) => b.percent - a.percent || byRecent(a, b),
  title: byTitle
}

const SORT_CYCLE: readonly AchievementSort[] = ['recent', 'completion', 'title']

/** The order X and the sort field step through. */
export function nextAchievementSort(sort: AchievementSort): AchievementSort {
  return SORT_CYCLE[(SORT_CYCLE.indexOf(sort) + 1) % SORT_CYCLE.length]
}

export function sortAchievementGames(
  games: readonly AchievementGameSummary[],
  sort: AchievementSort
): AchievementGameSummary[] {
  return [...games].sort(SORTS[sort])
}
