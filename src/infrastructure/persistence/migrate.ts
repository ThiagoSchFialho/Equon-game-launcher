import type { SqliteDatabase } from './database'
import type { Migration } from './migrations'

export interface MigrationResult {
  from: number
  to: number
}

export function schemaVersion(db: SqliteDatabase): number {
  return db.pragma('user_version', { simple: true }) as number
}

export function latestVersion(migrations: readonly Migration[]): number {
  return migrations.at(-1)?.version ?? 0
}

function assertContiguous(migrations: readonly Migration[]): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`Migration ${m.name} has version ${m.version}, expected ${i + 1}`)
    }
  })
}

/**
 * Applies pending migrations in order. Each one runs in its own transaction
 * together with the `user_version` bump, so a failure leaves the database at
 * the previous version. Foreign keys are switched off outside the transaction
 * (the pragma is a no-op inside one) so create-copy-rename migrations work,
 * and `foreign_key_check` must pass before commit.
 */
export function migrate(db: SqliteDatabase, migrations: readonly Migration[]): MigrationResult {
  assertContiguous(migrations)
  const from = schemaVersion(db)
  const to = latestVersion(migrations)
  if (from > to) {
    throw new Error(`Database schema v${from} is newer than this app supports (v${to})`)
  }

  for (const migration of migrations.slice(from)) {
    db.pragma('foreign_keys = OFF')
    try {
      db.transaction(() => {
        db.exec(migration.sql)
        const violations = db.pragma('foreign_key_check') as unknown[]
        if (violations.length > 0) {
          throw new Error(
            `Migration ${migration.name} left ${violations.length} foreign key violation(s)`
          )
        }
        db.pragma(`user_version = ${migration.version}`)
      })()
    } finally {
      db.pragma('foreign_keys = ON')
    }
  }
  return { from, to }
}
