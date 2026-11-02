import { existsSync, rmSync } from 'node:fs'
import { openDatabase, type SqliteDatabase } from './database'
import { latestVersion, migrate, schemaVersion } from './migrate'
import { migrations } from './migrations'

export interface AppDatabase {
  db: SqliteDatabase
  /** Backup written before migrating, if any. */
  backupPath: string | null
}

/**
 * Opens the app database file and brings its schema up to date. An existing
 * database is copied first (`VACUUM INTO`) when migrations are pending, so a
 * failed upgrade can be recovered (DATA_BASE_CONTEXT.md §6).
 */
export function openAppDatabase(filename: string): AppDatabase {
  const existed = existsSync(filename)
  const db = openDatabase(filename)
  try {
    let backupPath: string | null = null
    const current = schemaVersion(db)
    if (existed && current < latestVersion(migrations)) {
      backupPath = `${filename}.v${current}.bak`
      rmSync(backupPath, { force: true })
      db.prepare('VACUUM INTO ?').run(backupPath)
    }
    migrate(db, migrations)
    return { db, backupPath }
  } catch (error) {
    db.close()
    throw error
  }
}
