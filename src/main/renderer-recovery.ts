/** A second crash this soon means reloading will not help. */
export const CRASH_RETRY_WINDOW_MS = 60_000

export interface CrashPolicy {
  /** What to do about a renderer process that just died. */
  onCrash(): 'reload' | 'give-up'
}

/** Without this, a dead renderer leaves a blank window no controller can leave. */
export function createCrashPolicy(now: () => number): CrashPolicy {
  let last: number | null = null
  return {
    onCrash() {
      const time = now()
      const tooSoon = last !== null && time - last < CRASH_RETRY_WINDOW_MS
      last = time
      return tooSoon ? 'give-up' : 'reload'
    }
  }
}
