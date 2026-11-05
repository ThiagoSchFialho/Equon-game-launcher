import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  migrate,
  migrations,
  openAppDatabase,
  openDatabase,
  schemaVersion
} from '../../../src/infrastructure/persistence'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'equon-db-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('when something is wrong with the database', () => {
  const file = (): string => join(dir, 'equon.sqlite')

  /** An up-to-date database of the previous schema version, with one game in it. */
  const previousVersion = (): void => {
    const old = openDatabase(file())
    migrate(old, migrations.slice(0, migrations.length - 1))
    old.prepare("INSERT INTO games (title, origin) VALUES ('Kept', 'manual')").run()
    old.close()
  }

  it('a damaged file stops the app and is left exactly as it was', () => {
    const garbage = Buffer.from('this is not a sqlite database, at all'.repeat(100))
    writeFileSync(file(), garbage)
    expect(() => openAppDatabase(file())).toThrow()
    expect(readFileSync(file()).equals(garbage)).toBe(true)
    expect(existsSync(`${file()}.v0.bak`)).toBe(false)
  })

  it('data from a newer version is refused and not touched', () => {
    const newer = openDatabase(file())
    migrate(newer, migrations)
    newer.pragma('user_version = 9999')
    newer.close()
    expect(() => openAppDatabase(file())).toThrow(/newer than this app supports/)
    const check = openDatabase(file())
    expect(schemaVersion(check)).toBe(9999)
    check.close()
  })

  it('no migration runs if the backup could not be written', () => {
    previousVersion()
    const version = migrations.length - 1
    // A folder where the backup file has to go.
    mkdirSync(join(`${file()}.v${version}.bak`, 'occupied'), { recursive: true })
    expect(() => openAppDatabase(file())).toThrow()
    const check = openDatabase(file())
    expect(schemaVersion(check)).toBe(version)
    expect(check.prepare('SELECT count(*) AS c FROM games').get()).toEqual({ c: 1 })
    check.close()
  })

  it('the documented recovery works: the backup replaces a damaged file', () => {
    previousVersion()
    const version = migrations.length - 1
    const { db, backupPath } = openAppDatabase(file())
    db.close()
    expect(backupPath).toBe(`${file()}.v${version}.bak`)

    // The database is damaged afterwards.
    writeFileSync(file(), Buffer.from('damaged'.repeat(500)))
    expect(() => openAppDatabase(file())).toThrow()

    // Restore: remove the damaged file and its side files, and put the backup in its place.
    for (const side of ['', '-wal', '-shm']) rmSync(`${file()}${side}`, { force: true })
    copyFileSync(backupPath as string, file())
    const restored = openAppDatabase(file())
    expect(schemaVersion(restored.db)).toBe(migrations.length)
    expect(restored.db.prepare('SELECT title FROM games').all()).toEqual([{ title: 'Kept' }])
    expect(restored.db.pragma('integrity_check', { simple: true })).toBe('ok')
    restored.db.close()
  })
})

describe('openAppDatabase', () => {
  it('creates a new database at the latest schema without a backup', () => {
    const file = join(dir, 'equon.sqlite')
    const { db, backupPath } = openAppDatabase(file)
    expect(schemaVersion(db)).toBe(migrations.length)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(backupPath).toBeNull()
    db.close()
  })

  it('backs up an existing database before migrating it', () => {
    const file = join(dir, 'equon.sqlite')
    const old = openDatabase(file)
    old.exec('CREATE TABLE legacy (x INTEGER)')
    old.close()

    const { db, backupPath } = openAppDatabase(file)
    db.close()

    expect(backupPath).toBe(`${file}.v0.bak`)
    expect(existsSync(backupPath as string)).toBe(true)
    const backup = openDatabase(backupPath as string)
    expect(schemaVersion(backup)).toBe(0)
    expect(
      backup.prepare("SELECT name FROM sqlite_master WHERE name = 'legacy'").get()
    ).toBeDefined()
    backup.close()
  })

  it('does not back up a database that is already up to date', () => {
    const file = join(dir, 'equon.sqlite')
    openAppDatabase(file).db.close()
    const { db, backupPath } = openAppDatabase(file)
    db.close()
    expect(backupPath).toBeNull()
  })
})
