import { useEffect } from 'react'
import type { Action } from './actions'
import { createGamepadMapper } from './gamepad'
import { keyToAction } from './keyboard'

/**
 * Feeds semantic actions to `dispatch`: the Gamepad API is polled every
 * animation frame (it has no button events) and keys are mapped on keydown.
 * Gamepad input is ignored while the window is not focused, so playing a game
 * never drives the launcher in the background.
 */
export function useInput(dispatch: (action: Action) => void): void {
  useEffect(() => {
    const mapper = createGamepadMapper()
    let frame = 0

    const poll = (now: number): void => {
      if (document.hasFocus()) {
        for (const action of mapper.update(navigator.getGamepads(), now)) dispatch(action)
      } else {
        mapper.reset()
      }
      frame = requestAnimationFrame(poll)
    }
    frame = requestAnimationFrame(poll)

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.altKey || event.metaKey) return
      const action = keyToAction(event.key, event.repeat)
      if (!action) return
      event.preventDefault()
      dispatch(action)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [dispatch])
}
