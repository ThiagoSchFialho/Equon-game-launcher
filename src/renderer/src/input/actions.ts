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
  'scrollDown'
])
