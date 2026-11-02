import { REPEATING_ACTIONS, type Action } from './actions'

/** The part of the browser Gamepad object we read (also lets tests fake pads). */
export interface GamepadLike {
  buttons: readonly { pressed: boolean }[]
  axes: readonly number[]
}

export interface GamepadMapperOptions {
  /** Stick deflection that counts as a direction press. Resting sticks drift to about ±0.05. */
  stickThreshold: number
  /** Delay before a held direction starts repeating. */
  repeatDelayMs: number
  /** Interval between repeats while held. */
  repeatIntervalMs: number
}

export const DEFAULT_GAMEPAD_OPTIONS: GamepadMapperOptions = {
  stickThreshold: 0.5,
  repeatDelayMs: 400,
  repeatIntervalMs: 110
}

// Standard mapping (Xbox layout): https://w3c.github.io/gamepad/#remapping
const BUTTONS: readonly [number, Action][] = [
  [0, 'confirm'], // A
  [1, 'back'], // B
  [2, 'secondary'], // X
  [3, 'tertiary'], // Y
  [4, 'previousSection'], // LB
  [5, 'nextSection'], // RB
  [6, 'leftTrigger'], // LT
  [7, 'rightTrigger'], // RT
  [9, 'menu'], // Start / ☰
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right']
]

function heldActions(pads: readonly (GamepadLike | null)[], threshold: number): Set<Action> {
  const held = new Set<Action>()
  for (const pad of pads) {
    if (!pad) continue
    for (const [index, action] of BUTTONS) {
      if (pad.buttons[index]?.pressed) held.add(action)
    }
    const [lx = 0, ly = 0, , ry = 0] = pad.axes
    if (lx <= -threshold) held.add('left')
    if (lx >= threshold) held.add('right')
    if (ly <= -threshold) held.add('up')
    if (ly >= threshold) held.add('down')
    if (ry <= -threshold) held.add('scrollUp')
    if (ry >= threshold) held.add('scrollDown')
  }
  return held
}

export interface GamepadMapper {
  /** Returns the actions fired by this frame's pad state. */
  update(pads: readonly (GamepadLike | null)[], now: number): Action[]
  /** Forget held state, e.g. when the window loses focus. */
  reset(): void
}

/**
 * Turns polled pad state into actions: one action on press, then repeats for
 * held directions and scroll. Call `update` once per animation frame.
 */
export function createGamepadMapper(
  options: GamepadMapperOptions = DEFAULT_GAMEPAD_OPTIONS
): GamepadMapper {
  /** Action → time of the next repeat (or Infinity for non-repeating). */
  let nextFire = new Map<Action, number>()

  return {
    update(pads, now) {
      const held = heldActions(pads, options.stickThreshold)
      const fired: Action[] = []
      const next = new Map<Action, number>()
      for (const action of held) {
        const scheduled = nextFire.get(action)
        const repeats = REPEATING_ACTIONS.has(action)
        if (scheduled === undefined) {
          fired.push(action)
          next.set(action, repeats ? now + options.repeatDelayMs : Infinity)
        } else if (now >= scheduled) {
          fired.push(action)
          next.set(action, now + options.repeatIntervalMs)
        } else {
          next.set(action, scheduled)
        }
      }
      nextFire = next
      return fired
    },

    reset() {
      nextFire = new Map()
    }
  }
}
