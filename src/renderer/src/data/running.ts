import { createContext, useContext, useEffect, useState } from 'react'

export interface RunningState {
  /** Ids of games the launcher started that are still running. */
  ids: number[]
}

export const RunningContext = createContext<RunningState>({ ids: [] })

/**
 * Tracks running games from main (initial list + change events). When a
 * game stops, `onStopped` lets the app reload playtime and last played.
 */
export function useRunningLoader(onStopped: () => void): RunningState {
  const [ids, setIds] = useState<number[]>([])
  useEffect(() => {
    let previous: number[] = []
    const apply = (next: number[]): void => {
      if (previous.some((id) => !next.includes(id))) onStopped()
      previous = next
      setIds(next)
    }
    void window.equon.games.running().then(apply, () => {})
    return window.equon.games.onRunningChanged(apply)
  }, [onStopped])
  return { ids }
}

export function useRunning(): RunningState {
  return useContext(RunningContext)
}
