import { useEffect } from 'react'
import type { Action } from './actions'
import { createFocusClaimer } from './focus-claim'
import { createGamepadMapper } from './gamepad'
import { keyToAction } from './keyboard'
import { getTextCapture } from './text-capture'

/**
 * Feeds semantic actions to `dispatch`: the Gamepad API is polled every
 * animation frame (it has no button events) and keys are mapped on keydown.
 * Gamepad input is ignored while the window is not focused, so playing a game
 * never drives the launcher in the background. The one exception brings the
 * launcher to the front: see `createFocusClaimer`.
 */
export function useInput(dispatch: (action: Action) => void): void {
  useEffect(() => {
    const mapper = createGamepadMapper()
    const claimer = createFocusClaimer(() => window.equon.app.claimFocus())
    let frame = 0

    const poll = (now: number): void => {
      const pads = navigator.getGamepads?.() ?? []
      const pressed = pads.some((pad) => pad?.buttons.some((button) => button.pressed))
      if (claimer.update(pressed, document.hasFocus())) {
        mapper.reset()
      } else {
        for (const action of mapper.update(pads, now)) {
          claimer.markUsed()
          dispatch(action)
        }
      }
      frame = requestAnimationFrame(poll)
    }
    frame = requestAnimationFrame(poll)

    const onPointerDown = (): void => claimer.markUsed()
    const onKeyDown = (event: KeyboardEvent): void => {
      claimer.markUsed()
      if (event.ctrlKey || event.altKey || event.metaKey) return
      // While a text field is edited, typing goes to the text, not to shortcuts.
      const capture = getTextCapture()
      if (capture?.(event.key)) {
        event.preventDefault()
        return
      }
      const action = keyToAction(event.key, event.repeat)
      if (!action) return
      event.preventDefault()
      dispatch(action)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [dispatch])
}
