import init from './0001_init.sql?raw'
import manualGames from './0002_manual_games.sql?raw'
import emulators from './0003_emulators.sql?raw'
import dejusRating from './0004_dejus_rating.sql?raw'
import steamReleaseDate from './0005_steam_release_date.sql?raw'
import achievementsSyncedAt from './0006_achievements_synced_at.sql?raw'
import achievementIconLocked from './0007_achievement_icon_locked.sql?raw'
import artworkCheckedAt from './0008_artwork_checked_at.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** Ordered and contiguous from 1. Never edit a released migration; add a new one. */
export const migrations: readonly Migration[] = [
  { version: 1, name: '0001_init', sql: init },
  { version: 2, name: '0002_manual_games', sql: manualGames },
  { version: 3, name: '0003_emulators', sql: emulators },
  { version: 4, name: '0004_dejus_rating', sql: dejusRating },
  { version: 5, name: '0005_steam_release_date', sql: steamReleaseDate },
  { version: 6, name: '0006_achievements_synced_at', sql: achievementsSyncedAt },
  { version: 7, name: '0007_achievement_icon_locked', sql: achievementIconLocked },
  { version: 8, name: '0008_artwork_checked_at', sql: artworkCheckedAt }
]
