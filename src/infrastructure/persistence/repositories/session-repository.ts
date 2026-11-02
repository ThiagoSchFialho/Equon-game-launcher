import { NotFoundError, type SessionRepository } from '../../../core/application'
import { sessionDurationSeconds, type PlaySession, type SessionStatus } from '../../../core/domain'
import type { SqliteDatabase } from '../database'

interface SessionRow {
  id: number
  game_id: number
  started_at: string
  last_seen_at: string
  ended_at: string | null
  duration_seconds: number | null
  status: SessionStatus
}

const toSession = (row: SessionRow): PlaySession => ({
  id: row.id,
  gameId: row.game_id,
  startedAt: row.started_at,
  lastSeenAt: row.last_seen_at,
  endedAt: row.ended_at,
  durationSeconds: row.duration_seconds,
  status: row.status
})

export function createSessionRepository(db: SqliteDatabase): SessionRepository {
  const insert = db.prepare<[number, string, string], SessionRow>(`
    INSERT INTO play_sessions (game_id, started_at, last_seen_at, status)
    VALUES (?, ?, ?, 'running') RETURNING *`)
  const touch = db.prepare<[string, number]>(
    "UPDATE play_sessions SET last_seen_at = ? WHERE id = ? AND status = 'running'"
  )
  const selectRunning = db.prepare<[number], SessionRow>(
    "SELECT * FROM play_sessions WHERE id = ? AND status = 'running'"
  )
  const listRunning = db.prepare<[], SessionRow>(
    "SELECT * FROM play_sessions WHERE status = 'running' ORDER BY id"
  )
  const close = db.prepare<[string, string, number, SessionStatus, number], SessionRow>(`
    UPDATE play_sessions SET last_seen_at = ?, ended_at = ?, duration_seconds = ?, status = ?
    WHERE id = ? RETURNING *`)

  const running = (id: number): SessionRow => {
    const row = selectRunning.get(id)
    if (!row) throw new NotFoundError('Running session', id)
    return row
  }

  return {
    start: (gameId, startedAt) => toSession(insert.get(gameId, startedAt, startedAt) as SessionRow),

    touch: (sessionId, at) => {
      touch.run(at, sessionId)
    },

    complete: (sessionId, endedAt) => {
      const row = running(sessionId)
      const duration = sessionDurationSeconds(row.started_at, endedAt)
      return toSession(close.get(endedAt, endedAt, duration, 'completed', sessionId) as SessionRow)
    },

    listRunning: () => listRunning.all().map(toSession),

    // The launcher died while the game ran: close at the last heartbeat (D-08).
    interrupt: (sessionId) => {
      const row = running(sessionId)
      const duration = sessionDurationSeconds(row.started_at, row.last_seen_at)
      return toSession(
        close.get(
          row.last_seen_at,
          row.last_seen_at,
          duration,
          'interrupted',
          sessionId
        ) as SessionRow
      )
    }
  }
}
