import init from './0001_init.sql?raw'
import manualGames from './0002_manual_games.sql?raw'
import emulators from './0003_emulators.sql?raw'
import dejusRating from './0004_dejus_rating.sql?raw'

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
  { version: 4, name: '0004_dejus_rating', sql: dejusRating }
]
