import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVITY_SETTLE_MS,
  createBackgroundActivity,
  type BackgroundActivityTracker
} from '../../src/main/background-activity'
import type { BackgroundActivity } from '../../src/shared/ipc/contract'

let published: (BackgroundActivity | null)[]
let tracker: BackgroundActivityTracker

beforeEach(() => {
  vi.useFakeTimers()
  published = []
  tracker = createBackgroundActivity((activity) => published.push(activity))
})
afterEach(() => vi.useRealTimers())

describe('background activity', () => {
  it('publishes progress and clears after the tasks end', () => {
    expect(tracker.current()).toBeNull()
    tracker.update('artwork', { done: 0, total: 2 })
    tracker.update('artwork', { done: 1, total: 2 })
    expect(tracker.current()).toEqual({ task: 'artwork', done: 1, total: 2 })

    tracker.update('artwork', null)
    expect(tracker.current()).not.toBeNull() // still settling
    vi.advanceTimersByTime(ACTIVITY_SETTLE_MS)
    expect(tracker.current()).toBeNull()
    expect(published).toEqual([
      { task: 'artwork', done: 0, total: 2 },
      { task: 'artwork', done: 1, total: 2 },
      null
    ])
  })

  it('does not blink between tasks that follow each other', () => {
    tracker.update('library', { done: 0, total: 0 })
    tracker.update('library', null)
    vi.advanceTimersByTime(ACTIVITY_SETTLE_MS / 2)
    tracker.update('metadata', { done: 0, total: 3 })
    vi.advanceTimersByTime(ACTIVITY_SETTLE_MS * 2)
    expect(published).not.toContain(null)
    expect(tracker.current()).toEqual({ task: 'metadata', done: 0, total: 3 })
  })

  it('shows the achievement sync over a long artwork queue, then the queue again', () => {
    tracker.update('artwork', { done: 3, total: 162 })
    tracker.update('achievements', { done: 0, total: 0 })
    expect(tracker.current()).toEqual({ task: 'achievements', done: 0, total: 0 })
    tracker.update('achievements', null)
    expect(tracker.current()).toEqual({ task: 'artwork', done: 3, total: 162 })
  })

  it('a task ending leaves the others on screen, and ending nothing publishes nothing', () => {
    tracker.update('metadata', null)
    vi.advanceTimersByTime(ACTIVITY_SETTLE_MS)
    expect(published).toEqual([])

    tracker.update('library', { done: 0, total: 0 })
    tracker.update('metadata', { done: 4, total: 9 })
    tracker.update('library', null)
    expect(tracker.current()).toEqual({ task: 'metadata', done: 4, total: 9 })
  })
})
