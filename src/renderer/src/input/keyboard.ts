import { REPEATING_ACTIONS, type Action } from './actions'

const KEYS: Record<string, Action> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'confirm',
  ' ': 'confirm',
  Escape: 'back',
  Backspace: 'back',
  PageUp: 'scrollUp',
  PageDown: 'scrollDown',
  ContextMenu: 'menu',
  m: 'menu',
  M: 'menu',
  q: 'previousSection',
  Q: 'previousSection',
  e: 'nextSection',
  E: 'nextSection',
  // Library filters; while a text field is edited, the key types instead.
  x: 'secondary',
  X: 'secondary'
}

/** Maps a key event to an action; OS auto-repeat only counts for repeating actions. */
export function keyToAction(key: string, repeat: boolean): Action | null {
  const action = KEYS[key]
  if (!action) return null
  if (repeat && !REPEATING_ACTIONS.has(action)) return null
  return action
}
