import type { Direction } from '../input/actions'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Candidate {
  id: string
  rect: Rect
}

const EPSILON = 1

/**
 * Picks the nearest candidate in `direction` from `from`. A candidate must lie
 * beyond the current element's edge on that axis; among those, the score is
 * the gap along the axis plus twice the misalignment on the other axis
 * (zero when they overlap), so rows and columns are preferred over diagonals.
 */
export function findNext(
  from: Rect,
  candidates: readonly Candidate[],
  direction: Direction
): string | null {
  const horizontal = direction === 'left' || direction === 'right'
  let best: { id: string; score: number } | null = null

  for (const { id, rect } of candidates) {
    let gap: number
    switch (direction) {
      case 'right':
        gap = rect.left - (from.left + from.width)
        break
      case 'left':
        gap = from.left - (rect.left + rect.width)
        break
      case 'down':
        gap = rect.top - (from.top + from.height)
        break
      case 'up':
        gap = from.top - (rect.top + rect.height)
        break
    }
    if (gap < -EPSILON) continue

    const [aStart, aSize, bStart, bSize] = horizontal
      ? [from.top, from.height, rect.top, rect.height]
      : [from.left, from.width, rect.left, rect.width]
    const overlap = Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart)
    const misalignment = overlap > 0 ? 0 : Math.abs(aStart + aSize / 2 - (bStart + bSize / 2))

    const score = Math.max(0, gap) + 2 * misalignment
    if (best === null || score < best.score) best = { id, score }
  }
  return best?.id ?? null
}

/** Distance between centers, used to re-home focus when the focused element disappears. */
export function centerDistance(a: Rect, b: Rect): number {
  return Math.hypot(
    a.left + a.width / 2 - (b.left + b.width / 2),
    a.top + a.height / 2 - (b.top + b.height / 2)
  )
}
