export type SessionStatus = 'running' | 'completed' | 'interrupted'

export interface PlaySession {
  id: number
  gameId: number
  /** ISO-8601 UTC */
  startedAt: string
  /** Last launcher heartbeat while the game was observed. */
  lastSeenAt: string
  endedAt: string | null
  durationSeconds: number | null
  status: SessionStatus
}

/** Statuses whose duration counts toward playtime (D-08). */
export const COUNTED_SESSION_STATUSES: readonly SessionStatus[] = ['completed', 'interrupted']

/** Whole seconds between two ISO-8601 timestamps; never negative (clock changes clamp to 0). */
export function sessionDurationSeconds(startedAt: string, endedAt: string): number {
  const ms = Date.parse(endedAt) - Date.parse(startedAt)
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.floor(ms / 1000)
}

/**
 * playtime (minutes) = baseline + floor(sum of counted session seconds / 60).
 * The baseline is the Steam-reported total at the last sync (0 otherwise);
 * callers pass only the sessions not already included in it.
 */
export function playtimeMinutes(durationsSeconds: readonly number[], baselineMinutes = 0): number {
  const total = durationsSeconds.reduce((sum, s) => sum + Math.max(0, s), 0)
  return Math.max(0, baselineMinutes) + Math.floor(total / 60)
}
