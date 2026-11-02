import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
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
