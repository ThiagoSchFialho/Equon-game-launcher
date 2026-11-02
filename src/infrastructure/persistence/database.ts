import Database from 'better-sqlite3'

export type SqliteDatabase = Database.Database

/**
 * Opens a connection with the settings every connection must have. Foreign
 * keys are off by default in SQLite; without them cascades silently do nothing.
 */
export function openDatabase(filename: string): SqliteDatabase {
  const db = new Database(filename)
  try {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new Error('Could not enable SQLite foreign keys')
    }
    db.pragma('journal_mode = WAL')
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
