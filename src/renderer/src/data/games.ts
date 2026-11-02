import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { GameDetails, GameSummary } from '../../../shared/ipc/contract'

export type Loadable<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

export interface GamesState {
  games: Loadable<GameSummary[]>
  reload(): void
  /** Fetches again but keeps showing the current list, so focus stays in place. */
  refresh(): void
}

export const GamesContext = createContext<GamesState | null>(null)

/** Loads the visible library once; screens share it through GamesContext. */
export function useGamesLoader(): GamesState {
  const [games, setGames] = useState<Loadable<GameSummary[]>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    window.equon.games.list().then(
      (data) => !cancelled && setGames({ status: 'ready', data }),
      () => !cancelled && setGames({ status: 'error' })
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  const reload = useCallback(() => {
    setGames({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  return { games, reload, refresh }
}

export function useGames(): GamesState {
  const state = useContext(GamesContext)
  if (!state) throw new Error('useGames must be used inside the games provider')
  return state
}

export function useGameDetails(id: number): {
  details: Loadable<GameDetails | null>
  reload(): void
  /** Fetches again but keeps showing the current data (e.g. after a session ends). */
  refresh(): void
} {
  const [details, setDetails] = useState<Loadable<GameDetails | null>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    window.equon.games.get(id).then(
      (data) => !cancelled && setDetails({ status: 'ready', data }),
      () => !cancelled && setDetails({ status: 'error' })
    )
    return () => {
      cancelled = true
    }
  }, [id, attempt])

  const reload = useCallback(() => {
    setDetails({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])
  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  return { details, reload, refresh }
}
