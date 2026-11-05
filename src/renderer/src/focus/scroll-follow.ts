/**
 * Scrolling that keeps up with a held direction. The browser's smooth scroll
 * restarts on every call, so with focus moving each 110 ms it falls further and
 * further behind. Here the position closes in on a target that can move at any
 * time, so the distance stays bounded: speed × time constant.
 */

/** Smaller is faster: about 5× this to finish a single step. */
export const FOLLOW_TIME_CONSTANT_MS = 50
/** Closer than this is already there. */
const ARRIVED_PX = 0.5

/** Where the position should be after `elapsedMs`; never overshoots. */
export function followStep(current: number, target: number, elapsedMs: number): number {
  const next = target + (current - target) * Math.exp(-elapsedMs / FOLLOW_TIME_CONSTANT_MS)
  return Math.abs(target - next) < ARRIVED_PX ? target : next
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return p
  }
  return null
}

/** The scrollTop that centers `el` in `container`, within what the container can scroll. */
function centeredScrollTop(container: HTMLElement, el: HTMLElement): number {
  const item = el.getBoundingClientRect()
  const box = container.getBoundingClientRect()
  const wanted = container.scrollTop + (item.top + item.height / 2 - (box.top + box.height / 2))
  return Math.min(Math.max(wanted, 0), container.scrollHeight - container.clientHeight)
}

export interface ScrollFollower {
  /** Keeps `el` centered in its scroll container, moving there over the next frames. */
  follow(el: HTMLElement): void
  /** Stops where it is, e.g. before an instant jump. */
  cancel(): void
}

export function createScrollFollower(): ScrollFollower {
  let container: HTMLElement | null = null
  let position = 0
  let target = 0
  let frame: number | null = null
  let previous = 0

  const stop = (): void => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    container = null
  }

  const tick = (now: number): void => {
    frame = null
    if (!container?.isConnected) {
      container = null
      return
    }
    position = followStep(position, target, now - previous)
    previous = now
    container.scrollTop = position
    if (position === target) container = null
    else frame = requestAnimationFrame(tick)
  }

  return {
    follow(el) {
      const parent = scrollParent(el)
      if (!parent) return
      target = centeredScrollTop(parent, el)
      if (parent !== container) {
        stop()
        container = parent
        position = parent.scrollTop
      }
      if (frame === null) {
        previous = performance.now()
        frame = requestAnimationFrame(tick)
      }
    },
    cancel: stop
  }
}
