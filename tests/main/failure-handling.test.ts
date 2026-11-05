import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeFileAtomic } from '../../src/infrastructure/artwork/write-atomic'
import { describeDatabaseFailure } from '../../src/main/database-failure'
import { createCrashPolicy, CRASH_RETRY_WINDOW_MS } from '../../src/main/renderer-recovery'

describe('renderer crash policy', () => {
  it('reloads, gives up on a crash right after, and forgives an old one', () => {
    let time = 1000
    const policy = createCrashPolicy(() => time)
    expect(policy.onCrash()).toBe('reload')
    time += CRASH_RETRY_WINDOW_MS - 1
    expect(policy.onCrash()).toBe('give-up')
    time += CRASH_RETRY_WINDOW_MS
    expect(policy.onCrash()).toBe('reload')
  })
})

describe('database failure message', () => {
  const file = join('C:', 'dados', 'equon.sqlite')
  const failure = (code: string, message = 'x'): Error =>
    Object.assign(new Error(message), { code })

  it('says what happened and where the data and backups are', () => {
    const text = describeDatabaseFailure(failure('SQLITE_NOTADB', 'file is not a database'), file)
    expect(text).toContain('danificado')
    expect(text).toContain('Nada foi apagado')
    expect(text).toContain(join('C:', 'dados'))
    expect(text).toContain('equon.sqlite.v*.bak')
    expect(text).toContain('file is not a database')
  })

  it.each([
    ['SQLITE_CORRUPT', 'danificado'],
    ['SQLITE_BUSY', 'em uso'],
    ['SQLITE_CANTOPEN', 'permissão'],
    ['SQLITE_READONLY', 'permissão'],
    ['SQLITE_FULL', 'espaço em disco'],
    ['OTHER', 'Não foi possível abrir']
  ])('%s', (code, expected) => {
    expect(describeDatabaseFailure(failure(code), file)).toContain(expected)
  })

  it('asks for an update when the data is from a newer version', () => {
    const newer = new Error('Database schema v99 is newer than this app supports (v7)')
    expect(describeDatabaseFailure(newer, file)).toContain('versão mais nova')
  })

  it('copes with something that is not an Error', () => {
    expect(describeDatabaseFailure('boom', file)).toContain('boom')
    expect(describeDatabaseFailure(null, file)).toContain('Não foi possível abrir')
  })
})

describe('writeFileAtomic', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'equon-atomic-'))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes and replaces, leaving nothing else behind', () => {
    const path = join(dir, 'a.png')
    writeFileAtomic(path, Buffer.from('one'))
    writeFileAtomic(path, Buffer.from('two'))
    expect(readFileSync(path, 'utf8')).toBe('two')
    expect(readdirSync(dir)).toEqual(['a.png'])
  })

  it('a failed write keeps the previous file', () => {
    const path = join(dir, 'a.png')
    writeFileSync(path, 'good')
    // The temporary file cannot be created: the "folder" does not exist.
    expect(() => writeFileAtomic(join(dir, 'missing', 'a.png'), Buffer.from('x'))).toThrow()
    expect(readFileSync(path, 'utf8')).toBe('good')
    expect(readdirSync(dir)).toEqual(['a.png'])
  })
})
