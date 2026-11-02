import type { OriginKey } from './origin'

/** `installed` is tri-state (D-06): true, false (confirmed absent) or null (unknown). */
export type InstallState = boolean | null

export interface Game {
  id: number
  origin: OriginKey
  steamAppId: number | null
  title: string
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
}
