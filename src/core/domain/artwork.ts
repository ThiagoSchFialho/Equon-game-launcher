export const ARTWORK_KINDS = [
  'cover_square',
  'cover_portrait',
  'logo',
  'background',
  'header',
  // Shown over the screen while the game opens (D-22); only chosen by the user.
  'launch',
  // Behind the Home screen (D-30); only chosen by the user, else the launch image, then the
  // background.
  'home'
] as const
export type ArtworkKind = (typeof ARTWORK_KINDS)[number]

export const ARTWORK_SOURCES = ['steam', 'steamgriddb', 'igdb', 'user'] as const
export type ArtworkSource = (typeof ARTWORK_SOURCES)[number]

export interface GameArtwork {
  gameId: number
  kind: ArtworkKind
  /** Relative to the artwork cache folder. */
  localPath: string
  source: ArtworkSource
  sourceUrl: string | null
  width: number | null
  height: number | null
  /** Chosen by the user; never overwritten by automatic fetches. */
  userSelected: boolean
  /** ISO-8601 UTC */
  fetchedAt: string | null
}
