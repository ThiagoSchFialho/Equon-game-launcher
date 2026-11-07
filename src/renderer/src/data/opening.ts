import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

/** How long Play says "Abrindo…" and stays disabled after a press. */
export const OPENING_MS = 10_000

export interface OpeningState {
  isOpening(gameId: number): boolean
  start(gameId: number): void
}

export const OpeningContext = createContext<OpeningState>({
  isOpening: () => false,
  start: () => {}
})

/**
 * A game opened through a store shortcut gives no sign of life for a while, so Play answers
 * every press by itself. Kept above the screens: leaving the game page and coming back must not
 * enable Play again and open the game twice.
 */
export function useOpeningLoader(): OpeningState {
  const [opening, setOpening] = useState<ReadonlySet<number>>(new Set())
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const running = timers.current
    return () => {
      for (const timer of running) clearTimeout(timer)
      running.clear()
    }
  }, [])

  const start = useCallback((gameId: number) => {
    setOpening((current) => new Set(current).add(gameId))
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setOpening((current) => {
        const next = new Set(current)
        next.delete(gameId)
        return next
      })
    }, OPENING_MS)
    timers.current.add(timer)
  }, [])

  return useMemo(() => ({ isOpening: (gameId) => opening.has(gameId), start }), [opening, start])
}

export function useOpening(): OpeningState {
  return useContext(OpeningContext)
}
