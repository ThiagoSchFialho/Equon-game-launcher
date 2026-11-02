/**
 * Physical-keyboard capture for text entry (ARCHITECTURE.md §3.11). While a
 * capture is set, useInput offers each key to it first; keys it handles
 * (returns true) are not turned into actions.
 */
type TextCapture = (key: string) => boolean

let current: TextCapture | null = null

export function setTextCapture(capture: TextCapture | null): void {
  current = capture
}

export function getTextCapture(): TextCapture | null {
  return current
}
