import { createContext, useContext, useEffect, useState } from 'react'
import type { AchievementSort } from '../../../shared/achievements-view'
import type {
  AchievementsOverview,
  AchievementSyncStatus,
  GameAchievements
} from '../../../shared/ipc/contract'
import type { Loadable } from './games'

export interface AchievementSortState {
  sort: AchievementSort
  setSort(sort: AchievementSort): void
}

/** The overview sort survives opening a game; a restart brings back the default. */
export const AchievementSortContext = createContext<AchievementSortState | null>(null)

export function useAchievementSort(): AchievementSortState {
  const state = useContext(AchievementSortContext)
  if (!state) throw new Error('useAchievementSort must be used inside its provider')
  return state
}

/** Loads with `load`, then reloads without a loading state whenever main reports a change. */
function useLiveData<T>(load: () => Promise<T>, attempt: number): Loadable<T> {
  const [data, setData] = useState<Loadable<T>>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    const fetchNow = (): void => {
      load().then(
        (value) => !cancelled && setData({ status: 'ready', data: value }),
        () => !cancelled && setData({ status: 'error' })
      )
    }
    fetchNow()
    const unsubscribe = window.equon.achievements.onChanged(fetchNow)
    return () => {
      cancelled = true
      unsubscribe()
    }
    // `load` only closes over `attempt`-independent ids passed by the callers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt])
  return data
}

export function useAchievementsOverview(attempt: number): Loadable<AchievementsOverview> {
  return useLiveData(() => window.equon.achievements.overview(), attempt)
}

export function useAchievementSyncStatus(): Loadable<AchievementSyncStatus> {
  return useLiveData(() => window.equon.achievements.status(), 0)
}

export function useGameAchievements(
  id: number,
  attempt: number
): Loadable<GameAchievements | null> {
  return useLiveData(() => window.equon.achievements.game(id), attempt)
}
