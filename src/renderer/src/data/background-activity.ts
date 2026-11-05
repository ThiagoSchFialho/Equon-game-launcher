import { createContext, useEffect, useState } from 'react'
import type { BackgroundActivity } from '../../../shared/ipc/contract'

/** Lives above the screens, so changing section does not make the indicator blink. */
export const BackgroundActivityContext = createContext<BackgroundActivity | null>(null)

export function useBackgroundActivityLoader(): BackgroundActivity | null {
  const [activity, setActivity] = useState<BackgroundActivity | null>(null)
  useEffect(() => {
    let cancelled = false
    let received = false
    const unsubscribe = window.equon.activity.onChanged((value) => {
      received = true
      setActivity(value)
    })
    // An event that arrives first is newer than this answer.
    window.equon.activity.current().then(
      (value) => {
        if (!cancelled && !received) setActivity(value)
      },
      () => {}
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])
  return activity
}
