import type { SecretKind, UserRepository } from '../../core/application'
import { isSteamId64 } from '../../core/domain'
import type {
  HomeArtSettings,
  Result,
  SettingsInfo,
  SteamSyncInfo
} from '../../shared/ipc/contract'
import type { SteamService } from '../steam/steam-service'

/** Electron safeStorage behind a port, so tests need no Electron. */
export interface SecretCipher {
  available(): boolean
  encrypt(plain: string): Uint8Array
  /** Throws when the bytes cannot be decrypted (e.g. another Windows user). */
  decrypt(encrypted: Uint8Array): string
}

/** The Windows startup entry behind a port, so tests need no Electron. */
export interface LoginItem {
  /** False when unpackaged: it would register the bare Electron binary. */
  available(): boolean
  enabled(): boolean
  setEnabled(enabled: boolean): void
}

export interface SettingsServiceDeps {
  users: UserRepository
  cipher: SecretCipher
  loginItem: LoginItem
  steam: Pick<SteamService, 'refreshing' | 'lastRefresh'>
  lastSync(): SteamSyncInfo | null
  steamPath(): string | null
}

export interface SettingsService {
  get(): SettingsInfo
  setSteamId(steamId: string | null): Result<SettingsInfo>
  setSecret(kind: SecretKind, value: string | null): Result<SettingsInfo>
  setStartFullscreen(enabled: boolean): Result<SettingsInfo>
  setOpenAtLogin(enabled: boolean): Result<SettingsInfo>
  setUiSounds(enabled: boolean): Result<SettingsInfo>
  /** Values validated by the IPC schema (ranges and steps) before they get here. */
  setHomeArt(changes: Partial<HomeArtSettings>): Result<SettingsInfo>
}

/**
 * Settings › Conexões. API keys are encrypted with safeStorage before they
 * are stored (D-04, D-15); only "configured or not" ever leaves main, and
 * the keys are never logged.
 */
export function createSettingsService(deps: SettingsServiceDeps): SettingsService {
  const get = (): SettingsInfo => ({
    steamId: deps.users.getSteamId(),
    steamApiKey: deps.users.getSecret('steam-api-key') !== null,
    steamGridDbKey: deps.users.getSecret('steamgriddb-api-key') !== null,
    igdbClientId: deps.users.getSecret('igdb-client-id') !== null,
    igdbClientSecret: deps.users.getSecret('igdb-client-secret') !== null,
    secretsAvailable: deps.cipher.available(),
    steamPath: deps.steamPath(),
    refreshing: deps.steam.refreshing(),
    lastRefresh: deps.steam.lastRefresh(),
    lastSync: deps.lastSync(),
    startFullscreen: deps.users.getStartFullscreen(),
    uiSounds: deps.users.getUiSounds(),
    homeArt: deps.users.getHomeArt(),
    openAtLogin: deps.loginItem.available() && deps.loginItem.enabled(),
    openAtLoginAvailable: deps.loginItem.available()
  })

  const loginItemFailed = (): Result<SettingsInfo> => ({
    ok: false,
    error: { code: 'login-item-failed', field: 'openAtLogin' }
  })

  return {
    get,

    setSteamId(steamId) {
      const value = steamId?.trim() || null
      if (value !== null && !isSteamId64(value)) {
        return { ok: false, error: { code: 'invalid', field: 'steamId' } }
      }
      deps.users.setSteamId(value)
      return { ok: true, data: get() }
    },

    setSecret(kind, value) {
      const plain = value?.trim() || null
      if (plain === null) {
        deps.users.setSecret(kind, null)
        return { ok: true, data: get() }
      }
      if (!deps.cipher.available()) {
        return { ok: false, error: { code: 'secrets-unavailable', field: kind } }
      }
      deps.users.setSecret(kind, deps.cipher.encrypt(plain))
      return { ok: true, data: get() }
    },

    setStartFullscreen(enabled) {
      deps.users.setStartFullscreen(enabled)
      return { ok: true, data: get() }
    },

    setUiSounds(enabled) {
      deps.users.setUiSounds(enabled)
      return { ok: true, data: get() }
    },

    setHomeArt(changes) {
      deps.users.setHomeArt(changes)
      return { ok: true, data: get() }
    },

    setOpenAtLogin(enabled) {
      if (!deps.loginItem.available()) return loginItemFailed()
      try {
        deps.loginItem.setEnabled(enabled)
      } catch {
        return loginItemFailed()
      }
      // Windows has the last word: the checkbox never shows what it did not accept.
      return deps.loginItem.enabled() === enabled ? { ok: true, data: get() } : loginItemFailed()
    }
  }
}
