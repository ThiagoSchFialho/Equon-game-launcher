import { normalizeName } from './text'

/** Stable key of a row in ORIGINS (D-05). Built-in and user-created origins share this type. */
export type OriginKey = string

export const BuiltinOrigin = {
  steam: 'steam',
  manual: 'manual',
  yuzu: 'yuzu',
  ps2: 'ps2'
} as const

export type BuiltinOriginKey = (typeof BuiltinOrigin)[keyof typeof BuiltinOrigin]

export interface Origin {
  key: OriginKey
  name: string
  builtin: boolean
  /** Emulator that pre-fills the add-game form (DATA_BASE_CONTEXT.md §3.10). */
  defaultExecutablePath: string | null
  /** Default arguments; `{rom}` marks the ROM path. */
  defaultArguments: string[] | null
}

export const normalizeOriginName = normalizeName

/**
 * Derives the key for a new user origin from its display name:
 * "Nintendo 64" → "nintendo-64", "Pokémon Mini" → "pokemon-mini".
 * Returns null when the name has no usable characters.
 */
export function originKeyFromName(name: string): OriginKey | null {
  const key = normalizeName(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return key === '' ? null : key
}
