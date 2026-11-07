const ATTRIBUTE = 'data-cursor-hidden'

export interface CursorHider {
  hide(): void
  /** Stops listening and shows the cursor. */
  stop(): void
}

/**
 * Hides the mouse cursor while the controller is in use (DESIGN_SYSTEM.md §8); the mouse brings
 * it back. Chromium also sends a mouse move when the screen changes under a still cursor, so a
 * move only counts when the position changed.
 */
export function createCursorHider(root: HTMLElement = document.documentElement): CursorHider {
  let lastX: number | null = null
  let lastY: number | null = null
  let hidden = false

  const show = (): void => {
    if (!hidden) return
    hidden = false
    root.removeAttribute(ATTRIBUTE)
  }
  const onMove = (event: MouseEvent): void => {
    const moved = event.screenX !== lastX || event.screenY !== lastY
    lastX = event.screenX
    lastY = event.screenY
    if (moved) show()
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mousedown', show)

  return {
    hide() {
      if (hidden) return
      hidden = true
      root.setAttribute(ATTRIBUTE, '')
    },

    stop() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', show)
      show()
    }
  }
}
