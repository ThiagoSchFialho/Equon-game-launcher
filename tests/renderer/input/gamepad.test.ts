import { describe, expect, it } from 'vitest'
import { createGamepadMapper, type GamepadLike } from '../../../src/renderer/src/input/gamepad'
import { keyToAction } from '../../../src/renderer/src/input/keyboard'

const options = { stickThreshold: 0.5, repeatDelayMs: 400, repeatIntervalMs: 100 }

function pad(pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): GamepadLike {
  return {
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
    axes
  }
}

describe('gamepad mapper', () => {
  it('fires once per press for non-repeating buttons', () => {
    const mapper = createGamepadMapper(options)
    expect(mapper.update([pad([0])], 0)).toEqual(['confirm'])
    expect(mapper.update([pad([0])], 1000)).toEqual([])
    expect(mapper.update([pad()], 1100)).toEqual([])
    expect(mapper.update([pad([0])], 1200)).toEqual(['confirm'])
  })

  it('maps the standard buttons', () => {
    const mapper = createGamepadMapper(options)
    expect(mapper.update([pad([1, 4, 5, 9])], 0).sort()).toEqual(
      ['back', 'menu', 'nextSection', 'previousSection'].sort()
    )
  })

  it('repeats held directions after the delay, then at the interval', () => {
    const mapper = createGamepadMapper(options)
    expect(mapper.update([pad([15])], 0)).toEqual(['right'])
    expect(mapper.update([pad([15])], 399)).toEqual([])
    expect(mapper.update([pad([15])], 400)).toEqual(['right'])
    expect(mapper.update([pad([15])], 450)).toEqual([])
    expect(mapper.update([pad([15])], 500)).toEqual(['right'])
  })

  it('reads the left stick as directions and ignores resting drift', () => {
    const mapper = createGamepadMapper(options)
    expect(mapper.update([pad([], [-0.05, 0.04, 0.02, -0.05])], 0)).toEqual([])
    expect(mapper.update([pad([], [0.9, 0, 0, 0])], 10)).toEqual(['right'])
    expect(mapper.update([pad([], [0, -0.8, 0, 0])], 20)).toEqual(['up'])
  })

  it('reads the right stick as scroll', () => {
    const mapper = createGamepadMapper(options)
    expect(mapper.update([pad([], [0, 0, 0, 0.9])], 0)).toEqual(['scrollDown'])
  })

  it('combines several pads and skips disconnected slots', () => {
    const mapper = createGamepadMapper(options)
    expect(mapper.update([null, pad([0]), pad([0])], 0)).toEqual(['confirm'])
  })

  it('forgets held state on reset', () => {
    const mapper = createGamepadMapper(options)
    mapper.update([pad([0])], 0)
    mapper.reset()
    expect(mapper.update([pad([0])], 10)).toEqual(['confirm'])
  })
})

describe('keyboard mapping', () => {
  it('maps keys to the same actions', () => {
    expect(keyToAction('ArrowLeft', false)).toBe('left')
    expect(keyToAction('Enter', false)).toBe('confirm')
    expect(keyToAction('Escape', false)).toBe('back')
    expect(keyToAction('q', false)).toBe('previousSection')
    expect(keyToAction('x', false)).toBeNull()
  })

  it('lets OS auto-repeat through only for repeating actions', () => {
    expect(keyToAction('ArrowDown', true)).toBe('down')
    expect(keyToAction('Enter', true)).toBeNull()
  })
})
