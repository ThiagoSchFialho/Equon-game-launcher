import { openDatabase, type SqliteDatabase } from '../../src/infrastructure/persistence/database'
import { migrate } from '../../src/infrastructure/persistence/migrate'
import { migrations } from '../../src/infrastructure/persistence/migrations'

/** Fresh in-memory database with every migration applied. */
export function createTestDb(): SqliteDatabase {
  const db = openDatabase(':memory:')
  migrate(db, migrations)
  return db
}

export function insertGame(
  db: SqliteDatabase,
  values: { title?: string; origin?: string; steamId?: number | null } = {}
): number {
  const result = db
    .prepare('INSERT INTO games (title, origin, steam_id) VALUES (?, ?, ?)')
    .run(values.title ?? 'Game', values.origin ?? 'manual', values.steamId ?? null)
  return Number(result.lastInsertRowid)
}

export function count(db: SqliteDatabase, table: string): number {
  return (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
}
