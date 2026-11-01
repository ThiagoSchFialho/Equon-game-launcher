import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

// better-sqlite3 ships N-API prebuilds, so one binary serves both Node (tests)
// and Electron (app) without rebuilding. If a future version drops them, these
// tests fail with a load error and the rebuild scripts must come back
// (ARCHITECTURE.md §3.15).

const loadScript = `
  const Database = require('better-sqlite3')
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  process.stdout.write(JSON.stringify(db.pragma('foreign_keys', { simple: true })))
`

describe('better-sqlite3 native module', () => {
  it('loads under Node', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })

  it('loads under the pinned Electron runtime', () => {
    const electronPath = createRequire(import.meta.url)('electron') as unknown as string
    const output = execFileSync(electronPath, ['-e', loadScript], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      encoding: 'utf8',
      timeout: 30_000
    })
    expect(output).toBe('1')
  }, 40_000)
})
