import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { GameDetails, GameSummary } from '../../../shared/ipc/contract'

export type Loadable<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T }

export interface GamesState {
  games: Loadable<GameSummary[]>
  reload(): void
  /** Fetches again but keeps showing the current list, so focus stays in place. */
  refresh(): void
  /**
   * A game the user just started (Jogar, or a Home cover): LAUNCHED_REORDER_MS later it counts
   * as the most recently played, so it moves to the front of the Home (owner decision). The
   * database only moves last played when the session ends; until then this wins.
   */
  markLaunched(id: number): void
}

/** How long after a launch the game moves to the front of the Home (owner decision). */
export const LAUNCHED_REORDER_MS = 5000

/** Now in the database's ISO-8601 UTC format, without milliseconds. */
const nowIso = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

export const GamesContext = createContext<GamesState | null>(null)

/** Loads the visible library once; screens share it through GamesContext. */
export function useGamesLoader(): GamesState {
  const [games, setGames] = useState<Loadable<GameSummary[]>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // Launch times waiting for the session to end; a newer value from the database wins.
  const launched = useRef(new Map<number, string>())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])
  const withLaunched = useCallback(
    (data: GameSummary[]): GameSummary[] =>
      data.map((game) => {
        const at = launched.current.get(game.id)
        if (!at) return game
        if (game.timeLastPlayed !== null && game.timeLastPlayed >= at) {
          launched.current.delete(game.id)
          return game
        }
        return { ...game, timeLastPlayed: at }
      }),
    []
  )

  useEffect(() => {
    let cancelled = false
    window.equon.games.list().then(
      (data) => !cancelled && setGames({ status: 'ready', data: withLaunched(data) }),
      () => !cancelled && setGames({ status: 'error' })
    )
    return () => {
      cancelled = true
    }
  }, [attempt, withLaunched])

  const reload = useCallback(() => {
    setGames({ status: 'loading' })
    setAttempt((n) => n + 1)
  }, [])

  const refresh = useCallback(() => setAttempt((n) => n + 1), [])

  const markLaunched = useCallback(
    (id: number) => {
      const timer = setTimeout(() => {
        timers.current.delete(timer)
        launched.current.set(id, nowIso())
        setGames((state) =>
          state.status === 'ready' ? { status: 'ready', data: withLaunched(state.data) } : state
        )
      }, LAUNCHED_REORDER_MS)
      timers.current.add(timer)
    },
    [withLaunched]
  )

  return { games, reload, refresh, markLaunched }
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
