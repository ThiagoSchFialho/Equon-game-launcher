import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ArtworkKind } from '../../core/domain'

export const MAX_ARTWORK_BYTES = 20 * 1024 * 1024

/** Expected proportion per kind (width / height); logo and header are free. */
const RATIOS: Partial<Record<ArtworkKind, number>> = {
  background: 16 / 9,
  cover_square: 1,
  cover_portrait: 2 / 3
}
const RATIO_TOLERANCE = 0.05

export type ArtworkImportError =
  'unreadable' | 'too-large' | 'unsupported-type' | 'undecodable' | 'wrong-proportion'

export class ArtworkImportFailure extends Error {
  constructor(readonly code: ArtworkImportError) {
    super(`Artwork import failed: ${code}`)
  }
}

type ImageType = 'png' | 'jpg' | 'webp'

/** Real type from the file's magic bytes (never from its extension). */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

export function hasExpectedProportion(kind: ArtworkKind, width: number, height: number): boolean {
  const target = RATIOS[kind]
  if (target === undefined) return true
  return Math.abs(width / height - target) / target <= RATIO_TOLERANCE
}

export interface ImportedArtwork {
  /** Relative to the artwork cache folder. */
  localPath: string
  width: number
  height: number
}

/**
 * Validates a user-chosen image and copies it into the artwork cache as
 * `<gameId>/<kind>.<type>` (ARCHITECTURE.md §3.13). `decode` must fully
 * decode the image and return its real size (main uses Electron's
 * nativeImage), or null when it cannot.
 */
export function importArtwork(options: {
  sourcePath: string
  cacheDir: string
  gameId: number
  kind: ArtworkKind
  decode: (bytes: Buffer) => { width: number; height: number } | null
}): ImportedArtwork {
  let bytes: Buffer
  try {
    if (statSync(options.sourcePath).size > MAX_ARTWORK_BYTES) {
      throw new ArtworkImportFailure('too-large')
    }
    bytes = readFileSync(options.sourcePath)
  } catch (error) {
    if (error instanceof ArtworkImportFailure) throw error
    throw new ArtworkImportFailure('unreadable')
  }
  const type = detectImageType(bytes)
  if (!type) throw new ArtworkImportFailure('unsupported-type')
  const size = options.decode(bytes)
  if (!size || size.width <= 0 || size.height <= 0) throw new ArtworkImportFailure('undecodable')
  if (!hasExpectedProportion(options.kind, size.width, size.height)) {
    throw new ArtworkImportFailure('wrong-proportion')
  }

  const folder = join(options.cacheDir, String(options.gameId))
  mkdirSync(folder, { recursive: true })
  for (const other of ['png', 'jpg', 'webp']) {
    if (other !== type) rmSync(join(folder, `${options.kind}.${other}`), { force: true })
  }
  const localPath = `${options.gameId}/${options.kind}.${type}`
  writeFileSync(join(options.cacheDir, localPath), bytes)
  return { localPath, width: size.width, height: size.height }
}

/** Deletes a game's cached artwork folder (after the game row is removed). */
export function removeGameArtwork(cacheDir: string, gameId: number): void {
  rmSync(join(cacheDir, String(gameId)), { recursive: true, force: true })
}
