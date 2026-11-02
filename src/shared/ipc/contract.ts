// IPC contract shared by main, preload and renderer.
// Keep this file free of runtime dependencies: the sandboxed preload bundles it
// and cannot load npm packages.

export const IpcChannel = {
  appGetInfo: 'app:get-info',
  gamesList: 'games:list',
  gamesGet: 'games:get',
  gamesGetEditable: 'games:get-editable',
  gamesCreate: 'games:create',
  gamesUpdate: 'games:update',
  gamesRemove: 'games:remove',
  gamesLaunch: 'games:launch',
  gamesRunning: 'games:running',
  originsList: 'origins:list',
  originsCreate: 'origins:create',
  originsRename: 'origins:rename',
  originsRemove: 'origins:remove',
  emulatorsList: 'emulators:list',
  emulatorsSet: 'emulators:set',
  emulatorsRemove: 'emulators:remove',
  filesList: 'files:list',
  filesPickNative: 'files:pick-native'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

/** Events main sends to the renderer. */
export const IpcEvent = {
  /** Payload: ids of the games currently running. */
  gamesRunningChanged: 'games:running-changed'
} as const

export interface AppInfo {
  name: string
  version: string
}

/** Mirrors the domain artwork kinds (a test keeps them in sync). */
export const ARTWORK_KINDS = [
  'cover_square',
  'cover_portrait',
  'logo',
  'background',
  'header'
] as const
export type ArtworkKind = (typeof ARTWORK_KINDS)[number]

/** Privileged scheme that serves cached artwork; the renderer never sees file paths. */
export const ARTWORK_SCHEME = 'equon-art'

export function artworkUrl(gameId: number, kind: ArtworkKind): string {
  return `${ARTWORK_SCHEME}://game/${gameId}/${kind}`
}

/** Expected failures come back as data so the UI can explain them (codes, not text). */
export interface AppError {
  code: string
  /** Form field the error refers to, when there is one. */
  field?: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError }

/** A visible (not hidden) game, as shown in Home and Library. */
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
  /** Kinds with cached artwork. */
  artwork: ArtworkKind[]
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
  'steam' | 'not-installed' | 'install-unknown' | 'no-config' | 'emulator-missing'

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
  /** A new background image to import; null keeps the current one. */
  backgroundPath: string | null
}

export interface EditableGame {
  id: number
  form: ManualGameForm
  hasBackground: boolean
}

export type PickKind = 'executable' | 'emulator' | 'rom' | 'image' | 'directory'

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

/** API exposed to the renderer as `window.equon`. */
export interface EquonApi {
  app: {
    getInfo(): Promise<AppInfo>
  }
  games: {
    list(): Promise<GameSummary[]>
    get(id: number): Promise<GameDetails | null>
    getEditable(id: number): Promise<EditableGame | null>
    create(form: ManualGameForm): Promise<Result<{ id: number }>>
    update(id: number, form: ManualGameForm): Promise<Result<{ id: number }>>
    remove(id: number): Promise<Result<null>>
    launch(id: number): Promise<Result<null>>
    running(): Promise<number[]>
    /** Subscribes to running-game changes; returns the unsubscribe function. */
    onRunningChanged(listener: (runningGameIds: number[]) => void): () => void
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
    remove(key: string): Promise<Result<null>>
  }
  files: {
    /** null lists the starting view (drives and known folders). */
    list(path: string | null, kind: PickKind): Promise<Result<BrowserListing>>
    /** Native Windows dialog (mouse/keyboard); null when cancelled. */
    pickNative(kind: PickKind): Promise<string | null>
  }
}
