import { normalizeName } from './text'

export interface Genre {
  id: number
  name: string
}

export const normalizeGenreName = normalizeName
