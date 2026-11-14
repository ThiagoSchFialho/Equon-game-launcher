import { useEffect, useState } from 'react'

/**
 * The opening screen's times (D-35): at least `minMs`, so it does not blink; at most `maxMs`,
 * so a slow or missing Steam never holds the app back. Screen tests turn it off.
 */
export const SPLASH_TIMING = { enabled: true, minMs: 1000, maxMs: 6000, pollMs: 300, fadeMs: 240 }

export type SplashState = 'up' | 'leaving' | 'gone'

/**
 * The opening screen stays up until the app is ready (D-35): Settings answered, the games are
 * loaded and the startup library refresh (local Steam scan and owned games) is over, which
 * Settings reports as `refreshing`. Then it fades out.
 */
export function useSplash(gamesReady: boolean): SplashState {
  const [gone, setGone] = useState(!SPLASH_TIMING.enabled)
  const [refreshDone, setRefreshDone] = useState(false)
  const [minPassed, setMinPassed] = useState(false)
  const [maxPassed, setMaxPassed] = useState(false)

  useEffect(() => {
    if (!SPLASH_TIMING.enabled) return
    const min = setTimeout(() => setMinPassed(true), SPLASH_TIMING.minMs)
    const max = setTimeout(() => setMaxPassed(true), SPLASH_TIMING.maxMs)
    let cancelled = false
    let poll: ReturnType<typeof setTimeout> | null = null
    const check = (): void => {
      window.equon.settings.get().then(
        (info) => {
          if (cancelled) return
          if (info.refreshing) poll = setTimeout(check, SPLASH_TIMING.pollMs)
          else setRefreshDone(true)
        },
        // Settings cannot answer: nothing to wait for.
        () => !cancelled && setRefreshDone(true)
      )
    }
    check()
    return () => {
      cancelled = true
      clearTimeout(min)
      clearTimeout(max)
      if (poll) clearTimeout(poll)
    }
  }, [])

  const ready = maxPassed || (minPassed && gamesReady && refreshDone)
  // Faded out: taken away.
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => setGone(true), SPLASH_TIMING.fadeMs)
    return () => clearTimeout(timer)
  }, [ready])

  if (gone) return 'gone'
  return ready ? 'leaving' : 'up'
}
