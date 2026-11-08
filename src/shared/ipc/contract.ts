// IPC contract shared by main, preload and renderer.
// Keep this file free of runtime dependencies: the sandboxed preload bundles it
// and cannot load npm packages.

export const IpcChannel = {
  appGetInfo: 'app:get-info',
  appGetSystemInfo: 'app:get-system-info',
  appListDrives: 'app:list-drives',
  appIsFullscreen: 'app:is-fullscreen',
  appToggleFullscreen: 'app:toggle-fullscreen',
  appClaimFocus: 'app:claim-focus',
  appShutdown: 'app:shutdown',
  appQuit: 'app:quit',
  libraryRefresh: 'library:refresh',
  settingsGet: 'settings:get',
  settingsSetSteamId: 'settings:set-steam-id',
  settingsSetSecret: 'settings:set-secret',
  settingsSetStartFullscreen: 'settings:set-start-fullscreen',
  settingsSetOpenAtLogin: 'settings:set-open-at-login',
  settingsSetUiSounds: 'settings:set-ui-sounds',
  settingsSetHomeArt: 'settings:set-home-art',
  settingsTestConnection: 'settings:test-connection',
  libraryDuplicates: 'library:duplicates',
  libraryDismissDuplicate: 'library:dismiss-duplicate',
  activityCurrent: 'activity:current',
  achievementsOverview: 'achievements:overview',
  achievementsGame: 'achievements:game',
  achievementsSyncAll: 'achievements:sync-all',
  achievementsStatus: 'achievements:status',
  achievementsEnsureIcons: 'achievements:ensure-icons',
  artworkSearch: 'artwork:search',
  igdbSearch: 'igdb:search',
  igdbGame: 'igdb:game',
  igdbApplyArtwork: 'igdb:apply-artwork',
  artworkEditBegin: 'artwork-edit:begin',
  artworkEditEnd: 'artwork-edit:end',
  artworkEditFromFile: 'artwork-edit:from-file',
  artworkEditFromIgdb: 'artwork-edit:from-igdb',
  artworkEditGridAssets: 'artwork-edit:grid-assets',
  artworkEditFromGrid: 'artwork-edit:from-grid',
  artworkEditSteamChoices: 'artwork-edit:steam-choices',
  artworkEditFromSteam: 'artwork-edit:from-steam',
  artworkEditSave: 'artwork-edit:save',
  gamesList: 'games:list',
  gamesGet: 'games:get',
  gamesGetEditable: 'games:get-editable',
  gamesCreate: 'games:create',
  gamesUpdate: 'games:update',
  gamesUpdateSteam: 'games:update-steam',
  gamesRemove: 'games:remove',
  gamesLaunch: 'games:launch',
  gamesInstallSteam: 'games:install-steam',
  gamesUninstallSteam: 'games:uninstall-steam',
  gamesCancelLaunchCover: 'games:cancel-launch-cover',
  gamesRunning: 'games:running',
  gamesSetFlags: 'games:set-flags',
  originsList: 'origins:list',
  originsCreate: 'origins:create',
  originsRename: 'origins:rename',
  originsRemove: 'origins:remove',
  emulatorsList: 'emulators:list',
  emulatorsSet: 'emulators:set',
  emulatorsSetRomDirectory: 'emulators:set-rom-directory',
  emulatorsRemove: 'emulators:remove',
  filesList: 'files:list',
  filesPickNative: 'files:pick-native'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Events main sends to the renderer. */
export const IpcEvent = {
  /** Payload: ids of the games currently running. */
  gamesRunningChanged: 'games:running-changed',
  /** Payload: whether the image that covers the screen while a game opens is up. */
  launchCoverChanged: 'games:launch-cover-changed',
  /** No payload: games were added or changed by a library scan. */
  libraryChanged: 'library:changed',
  /** No payload: achievement data, sync progress or icons changed. */
  achievementsChanged: 'achievements:changed',
  /** Payload: the current BackgroundActivity, or null when nothing is running. */
  activityChanged: 'activity:changed'
} as const

export interface AppInfo {
  name: string
  version: string
}

/** Settings › Armazenamento: one disk of this PC. */
export interface DriveInfo {
  /** "C:" */
  letter: string
  /** The name given in Windows; null when it has none. */
  label: string | null
  removable: boolean
  totalBytes: number
  freeBytes: number
}

/** Settings › Sobre. */
export interface SystemInfo {
  appVersion: string
  electron: string
  chrome: string
  node: string
  /** e.g. "Windows 11 Pro (10.0.26300)". */
  os: string
  dataPath: string
  /** PRAGMA user_version. */
  schemaVersion: number
}

/** Result of the last Steam library scan. */
export interface LibraryRefreshInfo {
  status: 'complete' | 'partial' | 'failed'
  /** 'steam-not-found', 'libraryfolders-unreadable', 'library-unreadable' or null. */
  reason: string | null
  added: number
  missing: number
  unknown: number
  /** Possible duplicates found (review arrives in Phase 6c). */
  duplicates: number
  /** Why owned games could not be read ('not-configured', 'private-profile'…); null when read. */
  ownedError: string | null
  /** ISO-8601 UTC */
  finishedAt: string
}

export type SecretKind =
  'steam-api-key' | 'steamgriddb-api-key' | 'igdb-client-id' | 'igdb-client-secret'

/** Last Steam playtime sync (GetOwnedGames, once per launcher start). */
export interface SteamSyncInfo {
  status: 'ok' | 'failed'
  /** 'not-configured', 'invalid-key', 'private-profile', 'network'… or null. */
  error: string | null
  /** Games updated. */
  games: number
  /** ISO-8601 UTC */
  finishedAt: string
}

export type TrophyTier = 'bronze' | 'silver' | 'gold'

export interface TrophyTotals {
  platine: number
  gold: number
  silver: number
  bronze: number
}

/** One line of the achievements overview. */
export interface AchievementGameSummary {
  id: number
  title: string
  originName: string
  hidden: boolean
  /** ISO-8601 UTC */
  timeLastPlayed: string | null
  artwork: ArtworkKind[]
  artworkVersion: string | null
  unlocked: number
  total: number
  /** 0–100, never rounded up to look complete. */
  percent: number
  platinum: boolean
}

export interface AchievementsOverview {
  /** Platinum games plus unlocked achievements (owner decision, Phase 7). */
  total: number
  trophies: TrophyTotals
  games: AchievementGameSummary[]
  /** No Steam game was synced yet: the list is empty for that reason. */
  neverSynced: boolean
}

export interface AchievementItem {
  id: number
  name: string
  description: string | null
  /** ISO-8601 UTC */
  unlockedAt: string | null
  /** Null when unknown, never 0 for missing data. */
  globalPercent: number | null
  tier: TrophyTier
  iconCached: boolean
}

export interface GameAchievements {
  id: number
  title: string
  /** 'none': the game has no achievements, which is not an error. */
  status: 'ready' | 'none' | 'never-synced'
  /** The last sync of this game failed: the data below is the last known good. */
  stale: boolean
  unlockedCount: number
  total: number
  /** Null when no achievement is known. */
  percent: number | null
  platinum: boolean
  trophies: TrophyTotals
  unlocked: AchievementItem[]
  locked: AchievementItem[]
}

export interface AchievementSyncStatus {
  running: boolean
  done: number
  total: number
  failures: { title: string; reason: string }[]
  /** ISO-8601 UTC of the last finished full sync in this run. */
  lastRun: string | null
}

/** A Steam game found by a scan whose title matches a manual game (never merged automatically). */
export interface DuplicateInfo {
  manualGameId: number
  manualTitle: string
  steamTitle: string
}

/** A SteamGridDB game offered in the manual-game artwork search. */
export interface SteamGridDbGameInfo {
  id: number
  name: string
  year: number | null
}

/** Successful "Testar conexão". */
export interface ConnectionTest {
  /** Steam profile name; null for the other connections. */
  personaName: string | null
  /** False when the Steam profile hides game details (playtime cannot sync). */
  gamesVisible: boolean
}

/** Settings › Conexões and Sistema. Secrets are never sent: only whether they are set. */
/** "Mostrar arte do jogo como background" and how it looks (D-25). */
export interface HomeArtSettings {
  enabled: boolean
  /** Level 0 to HOME_ART_BLUR_MAX. */
  blur: number
  /** Percent, 0 to HOME_ART_DIM_MAX in steps of HOME_ART_DIM_STEP. */
  dim: number
}
export const HOME_ART_BLUR_MAX = 10
export const HOME_ART_DIM_MAX = 90
export const HOME_ART_DIM_STEP = 10

export interface SettingsInfo {
  steamId: string | null
  steamApiKey: boolean
  steamGridDbKey: boolean
  igdbClientId: boolean
  igdbClientSecret: boolean
  /** False when Windows cannot encrypt (safeStorage); secrets cannot be saved then. */
  secretsAvailable: boolean
  /** Steam folder found by the last scan; null = not found (yet). */
  steamPath: string | null
  refreshing: boolean
  lastRefresh: LibraryRefreshInfo | null
  lastSync: SteamSyncInfo | null
  startFullscreen: boolean
  /** "Sons da interface": feedback sounds on navigation and actions. */
  uiSounds: boolean
  /** Configurações › Aparência: the focused game's art behind the Home screen (D-25). */
  homeArt: HomeArtSettings
  /** As Windows reports it, so turning it off in the Task Manager shows here. */
  openAtLogin: boolean
  /** False when unpackaged: it would register the bare Electron binary. */
  openAtLoginAvailable: boolean
}

/** Mirrors the domain artwork kinds (a test keeps them in sync). */
export const ARTWORK_KINDS = [
  'cover_square',
  'cover_portrait',
  'logo',
  'background',
  'header',
  'launch'
] as const
export type ArtworkKind = (typeof ARTWORK_KINDS)[number]

/** Privileged scheme that serves cached artwork; the renderer never sees file paths. */
export const ARTWORK_SCHEME = 'equon-art'

/** Cached icon of an achievement (locked or unlocked art), served by the same privileged scheme. */
export function achievementIconUrl(achievementId: number, locked: boolean): string {
  return `${ARTWORK_SCHEME}://achievement/${achievementId}/${locked ? 'locked' : 'unlocked'}`
}

/**
 * `version` changes when the game's art is replaced: same address, new file, and
 * Chromium would keep showing the image it already has.
 */
export function artworkUrl(gameId: number, kind: ArtworkKind, version?: string | null): string {
  const url = `${ARTWORK_SCHEME}://game/${gameId}/${kind}`
  return version ? `${url}?v=${encodeURIComponent(version)}` : url
}

/** The art "Editar artes" handles; the header keeps coming from its sources. */
export const ARTWORK_EDIT_KINDS = [
  'cover_portrait',
  'cover_square',
  'logo',
  'background',
  'launch'
] as const
export type ArtworkEditKind = (typeof ARTWORK_EDIT_KINDS)[number]

/** 16:9 kinds the Steam gallery (store background and screenshots) can fill. */
export const STEAM_GALLERY_KINDS = ['background', 'launch'] as const
export type SteamGalleryKind = (typeof STEAM_GALLERY_KINDS)[number]

/** Preview of an image chosen but not saved yet. */
export function draftArtworkUrl(kind: ArtworkEditKind, version: number): string {
  return `${ARTWORK_SCHEME}://draft/${kind}?v=${version}`
}

/** Thumbnail of a SteamGridDB image, brought by main: the renderer never reaches the network. */
export function gridThumbnailUrl(assetId: number): string {
  return `${ARTWORK_SCHEME}://grid/${assetId}`
}

/** Thumbnail of a Steam background choice, also brought by main. */
export function steamChoiceThumbnailUrl(choiceId: number): string {
  return `${ARTWORK_SCHEME}://steam/${choiceId}`
}

/** One background Steam offers for a game; its addresses stay in main. */
export interface SteamChoiceInfo {
  id: number
  /** The store's own background, not a screenshot. */
  store: boolean
}

export interface ArtworkDraftInfo {
  /** Tells the browser this preview is a new image. */
  version: number
}

/** One image of the SteamGridDB gallery; its addresses stay in main. */
export interface GridAssetInfo {
  id: number
  width: number
  height: number
}

/** Expected failures come back as data so the UI can explain them (codes, not text). */
export interface AppError {
  code: string
  /** Form field the error refers to, when there is one. */
  field?: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

/** A game as shown in Home and Library (hidden ones included; the views filter them). */
export interface GameSummary {
  id: number
  title: string
  origin: string
  originName: string
  installed: boolean | null
  /** Minutes. */
  playtime: number
  /** ISO-8601 UTC */
  timeLastPlayed: string | null
  beated: boolean
  hidden: boolean
  /** Kinds with cached artwork. */
  artwork: ArtworkKind[]
  /** Changes when any of this game's art is replaced. */
  artworkVersion: string | null
  /** 0–100 of the known achievements; null when none are known (not the same as 0). */
  achievementPercent: number | null
}

export interface AchievementSummary {
  total: number
  unlocked: number
  platinum: boolean
}

export interface GameDetails extends GameSummary {
  description: string | null
  developer: string | null
  /** YYYY-MM-DD */
  releaseDate: string | null
  requiredAge: string | null
  genres: string[]
  /** null when no achievement is known for the game. */
  achievements: AchievementSummary | null
  /** Non-Steam game the user can edit and remove. */
  editable: boolean
  /** Play can be offered (launchIssue is null). */
  launchable: boolean
  /** Why Play is unavailable, or null. */
  launchIssue: LaunchIssue | null
  /** False for .url shortcuts: no process is observed, so no playtime is measured. */
  tracksTime: boolean
}

export type LaunchIssue =
  | 'not-installed'
  | 'install-unknown'
  | 'no-config'
  | 'emulator-missing'
  /** Steam is installing, updating or repairing the game. */
  | 'steam-busy'

export interface GameFlagsInput {
  hidden?: boolean
  beated?: boolean
}

export interface OriginInfo {
  key: string
  name: string
  builtin: boolean
}

/** A supported emulator and the executable configured for it (§3.12). */
export interface EmulatorInfo {
  key: string
  name: string
  /** Origin of the games it runs. */
  origin: string
  romExtensions: string[]
  /** null = not configured. */
  executablePath: string | null
  /** Folder whose loose .nsp and .xci files become games; null when not set. */
  romDirectory: string | null
}

/** Add/edit form of a non-Steam game. Paths are untrusted and re-validated in main. */
export interface ManualGameForm {
  title: string
  description: string | null
  developer: string | null
  /** YYYY-MM-DD */
  releaseDate: string | null
  /** 'L', '10', '12', '14', '16', '18' or null (not informed). */
  requiredAge: string | null
  /** Minutes played elsewhere. */
  playtimeOffset: number
  origin: string
  /** .exe or .url; empty for emulator games. */
  executablePath: string
  /** ROM of an emulator game (Yuzu); null otherwise. */
  romPath: string | null
  arguments: string[]
  workingDirectory: string | null
  /** Genres from IGDB, when filled from it; a game that already has genres keeps them. */
  genres?: string[]
  /** A new background image to import; null keeps the current one. */
}

/** What a Steam game's form edits (owner decision); everything else comes from Steam. */
export type SteamGameForm = Pick<
  ManualGameForm,
  'description' | 'developer' | 'releaseDate' | 'requiredAge' | 'genres'
>

/** A Steam game comes with origin 'steam' and no launch fields; only its details are edited. */
export interface EditableGame {
  id: number
  form: ManualGameForm
}

export type PickKind = 'executable' | 'game' | 'emulator' | 'rom' | 'image' | 'directory'

export interface BrowserEntry {
  name: string
  path: string
  type: 'directory' | 'file'
}

export interface BrowserListing {
  /** null = the starting view (drives and known folders). */
  path: string | null
  parent: string | null
  entries: BrowserEntry[]
  truncated: boolean
}

export interface IgdbGameInfo {
  id: number
  name: string
  year: number | null
  developer: string | null
}

/** What the form fills from IGDB. The description comes in English; genres in Portuguese. */
export interface IgdbGameFill {
  name: string
  summary: string | null
  releaseDate: string | null
  developer: string | null
  genres: string[]
  requiredAge: string | null
}

/** Background work the top bar reports. */
/** `roms`: games from an emulator's ROM folder being filled from IGDB. */
export type BackgroundTask = 'achievements' | 'library' | 'roms' | 'metadata' | 'artwork'

export interface BackgroundActivity {
  task: BackgroundTask
  done: number
  /** 0 when there is no count to show. */
  total: number
}

/** API exposed to the renderer as `window.equon`. */
export interface EquonApi {
  app: {
    getInfo(): Promise<AppInfo>
    getSystemInfo(): Promise<SystemInfo>
    /** Settings › Armazenamento. */
    listDrives(): Promise<Result<DriveInfo[]>>
    isFullscreen(): Promise<boolean>
    /** Resolves with the new state. */
    toggleFullscreen(): Promise<boolean>
    /** Brings the launcher to the front, unless a game is running. Resolves with whether it did. */
    claimFocus(): Promise<boolean>
    /** Turns the computer off. Takes no arguments: main runs one fixed command. */
    shutdown(): Promise<Result<null>>
    quit(): Promise<null>
  }
  igdb: {
    search(term: string): Promise<Result<IgdbGameInfo[]>>
    game(id: number): Promise<Result<IgdbGameFill | null>>
    /** After saving a game filled from IGDB: downloads what it does not have yet. */
    applyArtwork(gameId: number, igdbGameId: number): Promise<Result<ArtworkKind[]>>
  }
  activity: {
    current(): Promise<BackgroundActivity | null>
    /** Subscribes to changes; returns the unsubscribe function. */
    onChanged(listener: (activity: BackgroundActivity | null) => void): () => void
  }
  library: {
    /** Scans Steam again (also done at startup); concurrent calls share one scan. */
    refresh(): Promise<LibraryRefreshInfo>
    /** Possible duplicates found by the last scans, still to review. */
    duplicates(): Promise<DuplicateInfo[]>
    /** "Manter os dois": removes the candidate from the review list. */
    dismissDuplicate(manualGameId: number): Promise<void>
    /** Subscribes to library changes from scans; returns the unsubscribe function. */
    onChanged(listener: () => void): () => void
  }
  achievements: {
    overview(): Promise<AchievementsOverview>
    /** null when the game does not exist. */
    game(id: number): Promise<GameAchievements | null>
    /** Explicit full sync; resolves when it ends. Concurrent calls share one run. */
    syncAll(): Promise<AchievementSyncStatus>
    status(): Promise<AchievementSyncStatus>
    /** Downloads the missing icons of a game; the change event reports progress. */
    ensureIcons(id: number): Promise<void>
    onChanged(listener: () => void): () => void
  }
  artwork: {
    /** SteamGridDB name search for a manual game (needs the key). */
    search(term: string): Promise<Result<SteamGridDbGameInfo[]>>
  }
  /** "Editar artes": images wait in main until save; end drops what was not saved. */
  artworkEdit: {
    begin(gameId: number): Promise<void>
    end(): Promise<void>
    fromFile(gameId: number, kind: ArtworkEditKind, path: string): Promise<Result<ArtworkDraftInfo>>
    /** igdbGameId null: a Steam game, found by its App ID. */
    fromIgdb(
      gameId: number,
      kind: ArtworkEditKind,
      igdbGameId: number | null
    ): Promise<Result<ArtworkDraftInfo>>
    /** gridGameId null: a Steam game, found by its App ID. */
    gridAssets(
      gameId: number,
      kind: ArtworkEditKind,
      gridGameId: number | null
    ): Promise<Result<GridAssetInfo[]>>
    fromGrid(
      gameId: number,
      kind: ArtworkEditKind,
      assetId: number
    ): Promise<Result<ArtworkDraftInfo>>
    /** For the background or launch image of a Steam game: its store background and screenshots. */
    steamChoices(gameId: number): Promise<Result<SteamChoiceInfo[]>>
    fromSteam(
      gameId: number,
      kind: SteamGalleryKind,
      choiceId: number
    ): Promise<Result<ArtworkDraftInfo>>
    save(gameId: number, remove: ArtworkEditKind[]): Promise<Result<null>>
  }
  settings: {
    get(): Promise<SettingsInfo>
    setSteamId(steamId: string | null): Promise<Result<SettingsInfo>>
    /** null removes the secret. The value goes to main once and is never returned. */
    setSecret(kind: SecretKind, value: string | null): Promise<Result<SettingsInfo>>
    /** Takes effect the next time the launcher opens. */
    setStartFullscreen(enabled: boolean): Promise<Result<SettingsInfo>>
    setOpenAtLogin(enabled: boolean): Promise<Result<SettingsInfo>>
    setUiSounds(enabled: boolean): Promise<Result<SettingsInfo>>
    /** Only what changed; the rest stays. */
    setHomeArt(changes: Partial<HomeArtSettings>): Promise<Result<SettingsInfo>>
    /** One live request with the stored credentials. */
    testConnection(kind: 'steam' | 'steamgriddb' | 'igdb'): Promise<Result<ConnectionTest>>
  }
  games: {
    list(): Promise<GameSummary[]>
    get(id: number): Promise<GameDetails | null>
    getEditable(id: number): Promise<EditableGame | null>
    create(form: ManualGameForm): Promise<Result<{ id: number }>>
    update(id: number, form: ManualGameForm): Promise<Result<{ id: number }>>
    updateSteam(id: number, form: SteamGameForm): Promise<Result<{ id: number }>>
    remove(id: number): Promise<Result<null>>
    launch(id: number): Promise<Result<null>>
    /** Opens Steam's own window; the user answers there. */
    installSteam(id: number): Promise<Result<null>>
    /** Opens Steam's own confirmation; the user answers there. */
    uninstallSteam(id: number): Promise<Result<null>>
    running(): Promise<number[]>
    /** Manual flags; works for every origin and is never touched by sync. */
    setFlags(id: number, flags: GameFlagsInput): Promise<Result<null>>
    /** Subscribes to running-game changes; returns the unsubscribe function. */
    onRunningChanged(listener: (runningGameIds: number[]) => void): () => void
    /** Takes the opening image off the screen; a game already started goes on. */
    cancelLaunchCover(): Promise<void>
    onLaunchCoverChanged(listener: (active: boolean) => void): () => void
  }
  origins: {
    list(): Promise<OriginInfo[]>
    create(name: string): Promise<Result<OriginInfo>>
    rename(key: string, name: string): Promise<Result<OriginInfo>>
    remove(key: string): Promise<Result<null>>
  }
  emulators: {
    list(): Promise<EmulatorInfo[]>
    set(key: string, executablePath: string): Promise<Result<EmulatorInfo>>
    /** null removes the folder; its games stay. Saving a folder adds its ROMs in the background. */
    setRomDirectory(key: string, directory: string | null): Promise<Result<null>>
    remove(key: string): Promise<Result<null>>
  }
  files: {
    /** null lists the starting view (drives and known folders). */
    list(path: string | null, kind: PickKind): Promise<Result<BrowserListing>>
    /** Native Windows dialog (mouse/keyboard); null when cancelled. */
    pickNative(kind: PickKind): Promise<string | null>
  }
}
