export type SessionStatus = 'running' | 'completed' | 'interrupted'

/** Statuses whose duration counts toward playtime (D-08). */
export const COUNTED_SESSION_STATUSES: readonly SessionStatus[] = ['completed', 'interrupted']

/** Whole seconds between two ISO-8601 timestamps; never negative (clock changes clamp to 0). */
export function sessionDurationSeconds(startedAt: string, endedAt: string): number {
  const ms = Date.parse(endedAt) - Date.parse(startedAt)
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.floor(ms / 1000)
}

/** playtime (minutes) = floor(sum of counted session seconds / 60). */
export function playtimeMinutes(durationsSeconds: readonly number[]): number {
  const total = durationsSeconds.reduce((sum, s) => sum + Math.max(0, s), 0)
  return Math.floor(total / 60)
}
