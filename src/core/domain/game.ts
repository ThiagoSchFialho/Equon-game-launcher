import type { OriginKey } from './origin'

/** `installed` is tri-state (D-06): true, false (confirmed absent) or null (unknown). */
export type InstallState = boolean | null

export interface Game {
  id: number
  origin: OriginKey
  steamAppId: number | null
  /** The name shown, sorted and searched: the user's own (D-38), else the game's title. */
  title: string
  /** The game's own title, from Steam or as added; equal to `title` without a name of the user's. */
  originalTitle: string
  /** The user gave the game a name of their own (D-38). */
  customTitle: boolean
  description: string | null
  developer: string | null
  /** YYYY-MM-DD */
  releaseDate: string | null
  /** ISO-8601 UTC */
  timeLastPlayed: string | null
  hidden: boolean
  installed: InstallState
  /** Minutes: measured sessions plus the Steam baseline or the user-entered offset (D-08). */
  playtime: number
  /** Minutes the user entered for a non-Steam game (time played elsewhere). */
  playtimeOffset: number
  beated: boolean
  requiredAge: string | null
  /** ISO-8601 UTC; null = metadata not fetched yet or last fetch failed (D-16). */
  metadataFetchedAt: string | null
  /** ISO-8601 UTC; null = achievements never synced successfully. */
  achievementsSyncedAt: string | null
  /** When the artwork queue last got answers for this game; null = still to try. */
  artworkCheckedAt: string | null
}
