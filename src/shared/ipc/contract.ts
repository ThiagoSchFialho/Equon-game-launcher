// IPC contract shared by main, preload and renderer.
// Keep this file free of runtime dependencies: the sandboxed preload bundles it
// and cannot load npm packages.

export const IpcChannel = {
  appGetInfo: 'app:get-info',
  gamesList: 'games:list',
  gamesGet: 'games:get'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

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
}

/** API exposed to the renderer as `window.equon`. */
export interface EquonApi {
  app: {
    getInfo(): Promise<AppInfo>
  }
  games: {
    list(): Promise<GameSummary[]>
    get(id: number): Promise<GameDetails | null>
  }
}
