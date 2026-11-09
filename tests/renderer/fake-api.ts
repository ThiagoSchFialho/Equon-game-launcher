import { vi } from 'vitest'
import type {
  EmulatorInfo,
  EquonApi,
  SettingsInfo,
  GameDetails,
  GameSummary,
  OriginInfo
} from '../../src/shared/ipc/contract'

export const summary = (
  id: number,
  title: string,
  extra: Partial<GameSummary> = {}
): GameSummary => ({
  id,
  title,
  origin: 'manual',
  originName: 'Jogo Local',
  installed: true,
  playtime: 742,
  timeLastPlayed: `2026-11-0${id}T10:00:00Z`,
  beated: false,
  hidden: false,
  artwork: [],
  artworkVersion: null,
  achievementPercent: null,
  ...extra
})

export const details = (game: GameSummary, extra: Partial<GameDetails> = {}): GameDetails => ({
  ...game,
  description: 'Uma descrição.',
  developer: 'Estúdio A',
  releaseDate: '2020-05-01',
  requiredAge: '14',
  genres: ['Ação'],
  achievements: { total: 50, unlocked: 16, platinum: false },
  editable: game.origin !== 'steam',
  launchable: game.installed === true,
  launchIssue:
    game.installed === true ? null : game.installed === false ? 'not-installed' : 'install-unknown',
  tracksTime: true,
  ...extra
})

export const origins: OriginInfo[] = [
  { key: 'manual', name: 'Jogo Local', builtin: true },
  { key: 'ps2', name: 'PlayStation 2', builtin: true },
  { key: 'steam', name: 'Steam', builtin: true },
  { key: 'yuzu', name: 'Yuzu', builtin: true }
]

export const yuzu = (
  executablePath: string | null = null,
  romDirectory: string | null = null
): EmulatorInfo => ({
  key: 'yuzu',
  name: 'Yuzu',
  origin: 'yuzu',
  romExtensions: ['.nsp', '.xci', '.nca', '.nro', '.nso'],
  executablePath,
  romDirectory
})

export const settingsInfo = (extra: Partial<SettingsInfo> = {}): SettingsInfo => ({
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
  // Off in the fake app, so tests that are not about sound never touch audio (jsdom has none).
  uiSounds: false,
  homeArt: { enabled: false, blur: 4, dim: 60 },
  openAtLogin: false,
  openAtLoginAvailable: true,
  ...extra
})

const syncStatus = { running: false, done: 0, total: 0, failures: [], lastRun: null }

/** Installs a complete fake `window.equon`; pass overrides per test. */
export function installFakeApi(
  games: GameSummary[],
  overrides: {
    app?: Partial<EquonApi['app']>
    games?: Partial<EquonApi['games']>
    origins?: Partial<EquonApi['origins']>
    emulators?: Partial<EquonApi['emulators']>
    files?: Partial<EquonApi['files']>
    settings?: Partial<EquonApi['settings']>
    library?: Partial<EquonApi['library']>
    artwork?: Partial<EquonApi['artwork']>
    achievements?: Partial<EquonApi['achievements']>
    activity?: Partial<EquonApi['activity']>
    igdb?: Partial<EquonApi['igdb']>
    artworkEdit?: Partial<EquonApi['artworkEdit']>
  } = {}
): EquonApi {
  const runningListeners = new Set<(ids: number[]) => void>()
  const api: EquonApi = {
    app: {
      getInfo: async () => ({ name: 'equon', version: '0.1.0' }),
      getSystemInfo: async () => ({
        appVersion: '0.1.0',
        electron: '44.10.1',
        chrome: '146.0',
        node: '24.18.0',
        os: 'Windows 11 Pro (10.0.26300)',
        dataPath: 'C:\\Users\\u\\AppData\\Roaming\\equon-game-launcher-dev',
        schemaVersion: 12
      }),
      listDrives: async () => ({ ok: true, data: [] }),
      isFullscreen: async () => false,
      toggleFullscreen: async () => true,
      claimFocus: async () => true,
      shutdown: async () => ({ ok: true, data: null }),
      quit: async () => null,
      ...overrides.app
    },
    igdb: {
      search: async () => ({ ok: true, data: [] }),
      game: async () => ({ ok: true, data: null }),
      applyArtwork: async () => ({ ok: true, data: [] }),
      ...overrides.igdb
    },
    activity: {
      current: async () => null,
      onChanged: () => () => {},
      ...overrides.activity
    },
    library: {
      refresh: async () => ({
        status: 'complete',
        reason: null,
        added: 2,
        missing: 0,
        unknown: 0,
        duplicates: 0,
        ownedError: null,
        finishedAt: '2026-11-03T22:00:00Z'
      }),
      duplicates: async () => [],
      dismissDuplicate: async () => {},
      ignored: async () => [],
      unignore: async () => ({ ok: true, data: null }),
      onChanged: () => () => {},
      ...overrides.library
    },
    achievements: {
      overview: async () => ({
        total: 0,
        trophies: { platine: 0, gold: 0, silver: 0, bronze: 0 },
        games: [],
        neverSynced: true
      }),
      game: async () => null,
      syncAll: async () => syncStatus,
      status: async () => syncStatus,
      ensureIcons: async () => {},
      onChanged: () => () => {},
      ...overrides.achievements
    },
    artwork: {
      search: async () => ({ ok: true, data: [] }),
      ...overrides.artwork
    },
    settings: {
      get: async () => settingsInfo(),
      setSteamId: async (steamId) => ({ ok: true, data: settingsInfo({ steamId }) }),
      setStartFullscreen: async (startFullscreen) => ({
        ok: true,
        data: settingsInfo({ startFullscreen })
      }),
      setOpenAtLogin: async (openAtLogin) => ({ ok: true, data: settingsInfo({ openAtLogin }) }),
      setUiSounds: async (uiSounds) => ({ ok: true, data: settingsInfo({ uiSounds }) }),
      setHomeArt: async (changes) => ({
        ok: true,
        data: settingsInfo({ homeArt: { enabled: false, blur: 4, dim: 60, ...changes } })
      }),
      setSecret: async (kind, value) => ({
        ok: true,
        data: settingsInfo({
          steamApiKey: kind === 'steam-api-key' && value !== null,
          steamGridDbKey: kind === 'steamgriddb-api-key' && value !== null
        })
      }),
      testConnection: async () => ({
        ok: true,
        data: { personaName: 'Jogador', gamesVisible: true }
      }),
      ...overrides.settings
    },
    games: {
      list: async () => games,
      get: async (id) => {
        const game = games.find((g) => g.id === id)
        return game ? details(game) : null
      },
      getEditable: async () => null,
      create: async () => ({ ok: true, data: { id: 99 } }),
      update: async (id) => ({ ok: true, data: { id } }),
      updateSteam: async (id) => ({ ok: true, data: { id } }),
      remove: async () => ({ ok: true, data: null }),
      removeSteam: async () => ({ ok: true, data: null }),
      launch: async () => ({ ok: true, data: null }),
      installSteam: async () => ({ ok: true, data: null }),
      uninstallSteam: async () => ({ ok: true, data: null }),
      cancelLaunchCover: async () => {},
      onLaunchCoverChanged: () => () => {},
      running: async () => [],
      setFlags: async () => ({ ok: true, data: null }),
      onRunningChanged: (listener) => {
        runningListeners.add(listener)
        return () => runningListeners.delete(listener)
      },
      ...overrides.games
    },
    origins: {
      list: async () => origins,
      create: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
      ...overrides.origins
    },
    artworkEdit: {
      begin: async () => {},
      end: async () => {},
      fromFile: async () => ({ ok: true, data: { version: 1 } }),
      fromIgdb: async () => ({ ok: true, data: { version: 1 } }),
      gridAssets: async () => ({ ok: true, data: [] }),
      fromGrid: async () => ({ ok: true, data: { version: 1 } }),
      steamChoices: async () => ({ ok: true, data: [] }),
      fromSteam: async () => ({ ok: true, data: { version: 1 } }),
      save: async () => ({ ok: true, data: null }),
      ...overrides.artworkEdit
    },
    emulators: {
      list: async () => [yuzu()],
      set: async (_key, path) => ({ ok: true, data: yuzu(path) }),
      setRomDirectory: async () => ({ ok: true, data: null }),
      remove: async () => ({ ok: true, data: null }),
      ...overrides.emulators
    },
    files: {
      list: async () => ({
        ok: true,
        data: { path: null, parent: null, entries: [], truncated: false }
      }),
      pickNative: async () => null,
      ...overrides.files
    }
  }
  Object.defineProperty(window, 'equon', { value: api, configurable: true })
  return api
}
