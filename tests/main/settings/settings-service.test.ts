import { beforeEach, describe, expect, it } from 'vitest'
import { createUserRepository } from '../../../src/infrastructure/persistence'
import {
  createSettingsService,
  type SettingsService
} from '../../../src/main/settings/settings-service'
import { settingsInfoSchema, settingsSetSecretArgs } from '../../../src/shared/ipc/schemas'
import { createTestDb } from '../../helpers/db'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence'

let db: SqliteDatabase
let available: boolean
let settings: SettingsService

const KEY = 'ABCDEF0123456789ABCDEF0123456789'

beforeEach(() => {
  db = createTestDb()
  available = true
  settings = createSettingsService({
    users: createUserRepository(db),
    // Reversible stand-in for safeStorage, enough to prove nothing is stored in clear text.
    cipher: {
      available: () => available,
      encrypt: (plain) => new TextEncoder().encode([...plain].reverse().join('')),
      decrypt: (bytes) => [...new TextDecoder().decode(bytes)].reverse().join('')
    },
    steam: { refreshing: () => false, lastRefresh: () => null },
    lastSync: () => null,
    steamPath: () => 'C:\\Program Files (x86)\\Steam'
  })
})

describe('settings service', () => {
  it('starts empty and matches the IPC schema', () => {
    const info = settings.get()
    expect(info).toEqual({
      steamId: null,
      steamApiKey: false,
      steamGridDbKey: false,
      igdbClientId: false,
      igdbClientSecret: false,
      secretsAvailable: true,
      steamPath: 'C:\\Program Files (x86)\\Steam',
      refreshing: false,
      lastRefresh: null,
      lastSync: null
    })
    expect(settingsInfoSchema.safeParse(info).success).toBe(true)
  })

  it('validates and stores the SteamID64', () => {
    expect(settings.setSteamId('123')).toEqual({
      ok: false,
      error: { code: 'invalid', field: 'steamId' }
    })
    expect(settings.setSteamId('76561197960287930')).toMatchObject({
      ok: true,
      data: { steamId: '76561197960287930' }
    })
    expect(settings.setSteamId(null)).toMatchObject({ ok: true, data: { steamId: null } })
  })

  it('stores keys encrypted, reports only whether they are set, and removes them', () => {
    const result = settings.setSecret('steam-api-key', KEY)
    expect(result).toMatchObject({ ok: true, data: { steamApiKey: true, steamGridDbKey: false } })
    expect(JSON.stringify(result)).not.toContain(KEY)
    const stored = db.prepare('SELECT steam_api_key_encrypted AS v FROM users').get() as {
      v: Buffer
    }
    expect(Buffer.from(stored.v).toString()).not.toBe(KEY)

    expect(settings.setSecret('steam-api-key', null)).toMatchObject({
      ok: true,
      data: { steamApiKey: false }
    })
  })

  it('refuses to store keys when encryption is unavailable', () => {
    available = false
    expect(settings.setSecret('steamgriddb-api-key', KEY)).toEqual({
      ok: false,
      error: { code: 'secrets-unavailable', field: 'steamgriddb-api-key' }
    })
    expect(settings.get().steamGridDbKey).toBe(false)
  })

  it('accepts only plain token keys over IPC', () => {
    expect(settingsSetSecretArgs.safeParse(['steam-api-key', KEY]).success).toBe(true)
    expect(settingsSetSecretArgs.safeParse(['steam-api-key', null]).success).toBe(true)
    expect(settingsSetSecretArgs.safeParse(['steam-api-key', 'a b']).success).toBe(false)
    expect(settingsSetSecretArgs.safeParse(['other', KEY]).success).toBe(false)
  })
})
