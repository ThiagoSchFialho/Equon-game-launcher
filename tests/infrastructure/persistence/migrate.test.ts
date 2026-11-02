import { describe, expect, it } from 'vitest'
import { openDatabase } from '../../../src/infrastructure/persistence/database'
import { migrate, schemaVersion } from '../../../src/infrastructure/persistence/migrate'
import { migrations, type Migration } from '../../../src/infrastructure/persistence/migrations'

describe('openDatabase', () => {
  it('enables foreign keys on the connection', () => {
    const db = openDatabase(':memory:')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })
})

describe('migrate', () => {
  it('applies every migration and records the version', () => {
    const db = openDatabase(':memory:')
    expect(migrate(db, migrations)).toEqual({ from: 0, to: migrations.length })
    expect(schemaVersion(db)).toBe(migrations.length)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('is a no-op when the database is up to date', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations)
    expect(migrate(db, migrations)).toEqual({ from: migrations.length, to: migrations.length })
  })

  it('rolls back a failing migration, keeping the previous version', () => {
    const db = openDatabase(':memory:')
    const broken: Migration = {
      version: migrations.length + 1,
      name: 'broken',
      sql: 'CREATE TABLE half_done (a INTEGER) STRICT; INSERT INTO missing_table VALUES (1);'
    }
    expect(() => migrate(db, [...migrations, broken])).toThrow()
    expect(schemaVersion(db)).toBe(migrations.length)
    const table = db.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'").get()
    expect(table).toBeUndefined()
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  })

  it('rejects a migration that leaves foreign key violations', () => {
    const db = openDatabase(':memory:')
    migrate(db, migrations)
    const orphan: Migration = {
      version: migrations.length + 1,
      name: 'orphan',
      sql: "INSERT INTO games (title, origin) VALUES ('Orphan', 'does-not-exist');"
    }
    expect(() => migrate(db, [...migrations, orphan])).toThrow(/foreign key/)
    expect(schemaVersion(db)).toBe(migrations.length)
  })

  it('refuses a database created by a newer app version', () => {
    const db = openDatabase(':memory:')
    db.pragma(`user_version = ${migrations.length + 5}`)
    expect(() => migrate(db, migrations)).toThrow(/newer/)
  })

  it('rejects non-contiguous migration lists', () => {
    const db = openDatabase(':memory:')
    expect(() => migrate(db, [{ version: 2, name: 'gap', sql: '' }])).toThrow(/expected 1/)
  })
})
