import { beforeEach, describe, expect, it } from 'vitest'
import { createUserRepository } from '../../../src/infrastructure/persistence'
import {
  createSettingsService,
  type SettingsService
} from '../../../src/main/settings/settings-service'
import {
  settingsInfoSchema,
  settingsSetEnabledArgs,
  settingsSetSecretArgs
} from '../../../src/shared/ipc/schemas'
import { createTestDb } from '../../helpers/db'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence'

let db: SqliteDatabase
let available: boolean
let settings: SettingsService
let packaged: boolean
let atLogin: boolean
let setLogin: (enabled: boolean) => void

const KEY = 'ABCDEF0123456789ABCDEF0123456789'

beforeEach(() => {
  db = createTestDb()
  available = true
  packaged = true
  atLogin = false
  setLogin = (enabled) => {
    atLogin = enabled
  }
  settings = createSettingsService({
    loginItem: {
      available: () => packaged,
      enabled: () => atLogin,
      setEnabled: (enabled) => setLogin(enabled)
    },
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
      lastSync: null,
      startFullscreen: false,
      uiSounds: true,
      homeArt: { enabled: false, blur: 4, dim: 60 },
      openAtLogin: false,
      openAtLoginAvailable: true
    })
    expect(settingsInfoSchema.safeParse(info).success).toBe(true)
  })

  it('stores the Home background art: off by default, each value on its own, within its range', () => {
    expect(settings.setHomeArt({ enabled: true })).toMatchObject({
      ok: true,
      data: { homeArt: { enabled: true, blur: 4, dim: 60 } }
    })
    expect(settings.setHomeArt({ blur: 10 }).ok && settings.get().homeArt).toEqual({
      enabled: true,
      blur: 10,
      dim: 60
    })
    expect(settings.setHomeArt({ dim: 0, enabled: false }).ok && settings.get().homeArt).toEqual({
      enabled: false,
      blur: 10,
      dim: 0
    })
    // The table refuses what the IPC schema already refuses.
    for (const bad of [
      'home_art_blur = 11',
      'home_art_blur = -1',
      'home_art_dim = 95',
      'home_art_dim = 35',
      'home_art_background = 2'
    ]) {
      expect(() => db.prepare(`UPDATE users SET ${bad}`).run()).toThrow()
    }
  })

  it('has interface sounds on by default, stored as 0 or 1', () => {
    const stored = (): number =>
      (db.prepare('SELECT ui_sounds AS v FROM users').get() as { v: number }).v
    expect(stored()).toBe(1)
    expect(settings.setUiSounds(false)).toMatchObject({ ok: true, data: { uiSounds: false } })
    expect(stored()).toBe(0)
    expect(settings.setUiSounds(true)).toMatchObject({ ok: true, data: { uiSounds: true } })
    expect(stored()).toBe(1)
    expect(() => db.prepare('UPDATE users SET ui_sounds = 2').run()).toThrow()
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

  it('stores the fullscreen preference as 0 or 1', () => {
    const stored = (): number =>
      (db.prepare('SELECT start_fullscreen AS v FROM users').get() as { v: number }).v
    expect(stored()).toBe(0)
    expect(settings.setStartFullscreen(true)).toMatchObject({
      ok: true,
      data: { startFullscreen: true }
    })
    expect(stored()).toBe(1)
    expect(settings.setStartFullscreen(false)).toMatchObject({
      ok: true,
      data: { startFullscreen: false }
    })
    expect(stored()).toBe(0)
    expect(() => db.prepare('UPDATE users SET start_fullscreen = 2').run()).toThrow()
  })

  it('reads the startup entry from Windows, not from a stored copy', () => {
    expect(settings.setOpenAtLogin(true)).toMatchObject({ ok: true, data: { openAtLogin: true } })
    // Turned off in the Task Manager.
    atLogin = false
    expect(settings.get().openAtLogin).toBe(false)
  })

  it('never touches the startup entry when unpackaged', () => {
    packaged = false
    atLogin = true
    setLogin = () => {
      throw new Error('must not be called')
    }
    expect(settings.get()).toMatchObject({ openAtLogin: false, openAtLoginAvailable: false })
    expect(settings.setOpenAtLogin(true)).toEqual({
      ok: false,
      error: { code: 'login-item-failed', field: 'openAtLogin' }
    })
  })

  it('reports a startup entry Windows refused or ignored', () => {
    const failed = { ok: false, error: { code: 'login-item-failed', field: 'openAtLogin' } }
    setLogin = () => {
      throw new Error('refused')
    }
    expect(settings.setOpenAtLogin(true)).toEqual(failed)
    setLogin = () => {}
    expect(settings.setOpenAtLogin(true)).toEqual(failed)
    expect(settings.get().openAtLogin).toBe(false)
  })

  it('accepts only booleans for the system options over IPC', () => {
    expect(settingsSetEnabledArgs.safeParse([true]).success).toBe(true)
    expect(settingsSetEnabledArgs.safeParse(['true']).success).toBe(false)
    expect(settingsSetEnabledArgs.safeParse([]).success).toBe(false)
  })

  it('accepts only plain token keys over IPC', () => {
    expect(settingsSetSecretArgs.safeParse(['steam-api-key', KEY]).success).toBe(true)
    expect(settingsSetSecretArgs.safeParse(['steam-api-key', null]).success).toBe(true)
    expect(settingsSetSecretArgs.safeParse(['steam-api-key', 'a b']).success).toBe(false)
    expect(settingsSetSecretArgs.safeParse(['other', KEY]).success).toBe(false)
  })
})
