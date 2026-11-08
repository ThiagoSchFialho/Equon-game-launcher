/** Emulators the launcher supports (DATA_BASE_CONTEXT.md §3.12). */
export const EMULATOR_KEYS = ['yuzu'] as const
export type EmulatorKey = (typeof EMULATOR_KEYS)[number]

export interface EmulatorDefinition {
  key: EmulatorKey
  name: string
  /** Origin of the games this emulator runs. */
  origin: string
  /** Lower-case ROM extensions, with the dot. */
  romExtensions: readonly string[]
  /**
   * What the ROM folder turns into games (owner decision): whole games only. The other
   * extensions are parts of a game or homebrew, and can still be added by hand.
   */
  folderExtensions: readonly string[]
  /** Arguments that open a ROM directly. */
  argumentsFor(romPath: string): string[]
}

export const EMULATORS: Record<EmulatorKey, EmulatorDefinition> = {
  yuzu: {
    key: 'yuzu',
    name: 'Yuzu',
    origin: 'yuzu',
    romExtensions: ['.nsp', '.xci', '.nca', '.nro', '.nso'],
    folderExtensions: ['.nsp', '.xci'],
    // -f fullscreen, -g game path.
    argumentsFor: (romPath) => ['-f', '-g', romPath]
  }
}

/** The configured executable of a supported emulator, and the folder of its ROMs. */
export interface EmulatorConfig {
  key: EmulatorKey
  executablePath: string
  /** Its loose ROM files become games (DATA_BASE_CONTEXT.md §3.12); null when not set. */
  romDirectory: string | null
}

/** A Switch title ID in a file name: 16 hex digits between brackets. */
const TITLE_ID = /\[([0-9a-f]{16})\]/i
/** Tags that name an update or extra content. */
const NOT_A_GAME_TAG = /[[(]\s*(upd|update|dlc|addon|add-on)\b[^\])]*[\])]/i

/**
 * Whether a ROM file of the folder is a whole game. An update's title ID ends in 800 and extra
 * content's in anything but 000; a name without a title ID counts as a game.
 */
export function isBaseGameRom(emulator: EmulatorDefinition, fileName: string): boolean {
  const lower = fileName.toLowerCase()
  if (!emulator.folderExtensions.some((ext) => lower.endsWith(ext))) return false
  if (NOT_A_GAME_TAG.test(fileName)) return false
  const id = TITLE_ID.exec(fileName)?.[1]
  return id === undefined || id.toLowerCase().endsWith('000')
}

/**
 * A title sorted by its article, as ROM sets name them: "Legend of Zelda, The - Link's
 * Awakening" is "The Legend of Zelda - Link's Awakening" (owner's ROMs, 2026-11-07).
 */
const TRAILING_ARTICLE = /^(.+?), (The|A|An)(?=\s+-\s|$)/i

/**
 * The game's name from its ROM file: no extension, no tags in brackets or parentheses
 * (title ID, version, region), underscores as spaces, the article in front. Empty when
 * nothing is left.
 */
export function romGameTitle(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–]+|[\s\-–]+$/g, '')
    .replace(TRAILING_ARTICLE, '$2 $1')
}

/** Names compared as people read them: no case, accents, marks (™, ®, ©) or punctuation. */
export function sameGameName(a: string, b: string): boolean {
  const key = (name: string): string =>
    name
      // Before NFKD, which turns ™ into "TM".
      .replace(/[™®©]/g, '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
  return key(a) !== '' && key(a) === key(b)
}

export function emulatorForOrigin(origin: string): EmulatorDefinition | null {
  return Object.values(EMULATORS).find((e) => e.origin === origin) ?? null
}

export function isRomFor(emulator: EmulatorDefinition, path: string): boolean {
  const lower = path.trim().toLowerCase()
  return emulator.romExtensions.some((ext) => lower.endsWith(ext))
}
