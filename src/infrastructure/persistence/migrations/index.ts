import init from './0001_init.sql?raw'
import manualGames from './0002_manual_games.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** Ordered and contiguous from 1. Never edit a released migration; add a new one. */
export const migrations: readonly Migration[] = [
  { version: 1, name: '0001_init', sql: init },
  { version: 2, name: '0002_manual_games', sql: manualGames }
]
