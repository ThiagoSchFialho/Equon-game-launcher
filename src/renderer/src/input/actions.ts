/**
 * Semantic actions (ARCHITECTURE.md §3.11, mapping in DESIGN_SYSTEM.md §8).
 * Screens and components only ever see these, never raw buttons or keys.
 */
export type Action =
  | 'confirm'
  | 'back'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'scrollUp'
  | 'scrollDown'
  | 'menu'
  | 'previousSection'
  | 'nextSection'
  /** X: backspace on the on-screen keyboard; filters in the Library (also the X key). */
  | 'secondary'
  /** Y: space on the on-screen keyboard; search in the Library. */
  | 'tertiary'
  /** LT: shift on the on-screen keyboard. */
  | 'leftTrigger'
  /** RT: done on the on-screen keyboard. */
  | 'rightTrigger'
  /** Xbox button: the system menu, from any screen (Home key). */
  | 'system'

export type Direction = 'up' | 'down' | 'left' | 'right'

export const isDirection = (action: Action): action is Direction =>
  action === 'up' || action === 'down' || action === 'left' || action === 'right'

/** Actions that repeat while held. */
export const REPEATING_ACTIONS: ReadonlySet<Action> = new Set([
  'up',
  'down',
  'left',
  'right',
  'scrollUp',
  'scrollDown',
  'secondary'
])
