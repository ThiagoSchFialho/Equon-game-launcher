import init from './0001_init.sql?raw'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** Ordered and contiguous from 1. Never edit a released migration; add a new one. */
export const migrations: readonly Migration[] = [{ version: 1, name: '0001_init', sql: init }]
