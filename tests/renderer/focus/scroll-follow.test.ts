// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createScrollFollower,
  followStep,
  FOLLOW_TIME_CONSTANT_MS
} from '../../../src/renderer/src/focus/scroll-follow'

describe('followStep', () => {
  it('closes in on the target, in both directions, without overshooting', () => {
    const down = followStep(0, 1000, FOLLOW_TIME_CONSTANT_MS)
    expect(down).toBeGreaterThan(600)
    expect(down).toBeLessThan(1000)
    const up = followStep(1000, 0, FOLLOW_TIME_CONSTANT_MS)
    expect(up).toBeGreaterThan(0)
    expect(up).toBeLessThan(400)
    expect(followStep(0, 1000, 100_000)).toBe(1000)
  })

  it('settles one row of the Library in under 200 ms (owner: twice as fast as before)', () => {
    let position = 0
    let elapsed = 0
    while (position !== 311) {
      position = followStep(position, 311, 16)
      elapsed += 16
    }
    expect(elapsed).toBeLessThan(200)
  })

  it('arrives exactly, so the animation can end', () => {
    expect(followStep(999.8, 1000, 16)).toBe(1000)
    expect(followStep(1000, 1000, 16)).toBe(1000)
  })

  it('stays close to a target that keeps moving, as with a held direction', () => {
    const rowPx = 311
    const everyMs = 110
    const frameMs = 16
    let position = 0
    let target = 0
    let worst = 0
    for (let t = 0; t < 60_000; t += frameMs) {
      if (t % (everyMs - (everyMs % frameMs)) === 0) target += rowPx
      position = followStep(position, target, frameMs)
      worst = Math.max(worst, target - position)
    }
    // Never more than about a row and a half behind, however long it is held.
    expect(worst).toBeLessThan(rowPx * 1.5)
  })
})

describe('createScrollFollower', () => {
  let frames: Map<number, FrameRequestCallback>
  let nextFrame: number
  let list: HTMLDivElement
  let items: HTMLElement[]

  /** Runs the pending frame `ms` after the previous one. */
  const runFrame = (time: number): void => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(time)
  }

  beforeEach(() => {
    frames = new Map()
    nextFrame = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(nextFrame, callback)
      return nextFrame++
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    vi.spyOn(performance, 'now').mockReturnValue(0)

    list = document.createElement('div')
    list.style.overflowY = 'auto'
    Object.defineProperty(list, 'clientHeight', { value: 100 })
    Object.defineProperty(list, 'scrollHeight', { value: 1100 })
    list.getBoundingClientRect = () => ({ top: 0, height: 100 }) as DOMRect
    items = [0, 500, 1050].map((top) => {
      const item = document.createElement('button')
      // Where it is on screen follows the list's scroll, like real layout.
      item.getBoundingClientRect = () => ({ top: top - list.scrollTop, height: 50 }) as DOMRect
      list.append(item)
      return item
    })
    document.body.append(list)
  })

  afterEach(() => {
    list.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('moves over several frames and ends centered', () => {
    const follower = createScrollFollower()
    follower.follow(items[1])
    expect(list.scrollTop).toBe(0) // nothing jumps before the first frame
    runFrame(16)
    expect(list.scrollTop).toBeGreaterThan(0)
    expect(list.scrollTop).toBeLessThan(475)
    for (let t = 32; frames.size > 0; t += 16) runFrame(t)
    expect(list.scrollTop).toBe(475)
  })

  it('stays inside what the list can scroll', () => {
    const follower = createScrollFollower()
    follower.follow(items[2])
    for (let t = 16; frames.size > 0; t += 16) runFrame(t)
    expect(list.scrollTop).toBe(1000)
    follower.follow(items[0])
    for (let t = 16; frames.size > 0; t += 16) runFrame(t)
    expect(list.scrollTop).toBe(0)
  })

  it('takes a new target while moving, with one animation only', () => {
    const follower = createScrollFollower()
    follower.follow(items[1])
    runFrame(16)
    follower.follow(items[2])
    expect(frames.size).toBe(1)
    for (let t = 32; frames.size > 0; t += 16) runFrame(t)
    expect(list.scrollTop).toBe(1000)
  })

  it('cancel stops at once, and a list that left the page ends the animation', () => {
    const follower = createScrollFollower()
    follower.follow(items[1])
    runFrame(16)
    const reached = list.scrollTop
    follower.cancel()
    expect(frames.size).toBe(0)
    expect(list.scrollTop).toBe(reached)

    follower.follow(items[1])
    list.remove()
    runFrame(32)
    expect(frames.size).toBe(0)
    expect(list.scrollTop).toBe(reached)
  })
})
