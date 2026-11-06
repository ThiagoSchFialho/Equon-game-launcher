import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ArtworkKind } from '../../core/domain'
import { writeFileAtomic } from './write-atomic'

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

/**
 * Portrait covers: SteamGridDB's are 2:3 and IGDB's are all 3:4 (measured on 2026-11-05).
 * The Home card is 3:4 and stretches whatever it gets to fill it, so both are accepted.
 */
const PORTRAIT_WIDEST = 3 / 4

export function hasExpectedProportion(kind: ArtworkKind, width: number, height: number): boolean {
  const target = RATIOS[kind]
  if (target === undefined) return true
  if (kind === 'cover_portrait' && width / height >= target) {
    return width / height <= PORTRAIT_WIDEST * (1 + RATIO_TOLERANCE)
  }
  return Math.abs(width / height - target) / target <= RATIO_TOLERANCE
}

export interface ImportedArtwork {
  /** Relative to the artwork cache folder. */
  localPath: string
  width: number
  height: number
}

export interface PreparedArtwork {
  bytes: Buffer
  type: ImageType
  width: number
  height: number
}

/**
 * Validates a user-chosen image without writing anything
 * (ARCHITECTURE.md §3.13): size limit, real type, full decode and proportion.
 * `decode` must decode the image and return its real size (main uses
 * Electron's nativeImage), or null when it cannot.
 */
export function prepareArtwork(
  sourcePath: string,
  kind: ArtworkKind,
  decode: (bytes: Buffer) => { width: number; height: number } | null
): PreparedArtwork {
  let bytes: Buffer
  try {
    if (statSync(sourcePath).size > MAX_ARTWORK_BYTES) throw new ArtworkImportFailure('too-large')
    bytes = readFileSync(sourcePath)
  } catch (error) {
    if (error instanceof ArtworkImportFailure) throw error
    throw new ArtworkImportFailure('unreadable')
  }
  return prepareArtworkBytes(bytes, kind, decode)
}

/**
 * The checks shared by local files and downloads (ARCHITECTURE.md §3.13):
 * size limit, real type from the magic bytes, full decode and proportion.
 */
export function prepareArtworkBytes(
  bytes: Buffer,
  kind: ArtworkKind,
  decode: (bytes: Buffer) => { width: number; height: number } | null
): PreparedArtwork {
  if (bytes.length > MAX_ARTWORK_BYTES) throw new ArtworkImportFailure('too-large')
  const type = detectImageType(bytes)
  if (!type) throw new ArtworkImportFailure('unsupported-type')
  const size = decode(bytes)
  if (!size || size.width <= 0 || size.height <= 0) throw new ArtworkImportFailure('undecodable')
  if (!hasExpectedProportion(kind, size.width, size.height)) {
    throw new ArtworkImportFailure('wrong-proportion')
  }
  return { bytes, type, width: size.width, height: size.height }
}

/** Writes prepared artwork as `<gameId>/<kind>.<type>`, replacing other formats of that kind. */
export function writeArtwork(
  cacheDir: string,
  gameId: number,
  kind: ArtworkKind,
  artwork: PreparedArtwork
): ImportedArtwork {
  const folder = join(cacheDir, String(gameId))
  mkdirSync(folder, { recursive: true })
  const localPath = `${gameId}/${kind}.${artwork.type}`
  writeFileAtomic(join(cacheDir, localPath), artwork.bytes)
  // Only now: a failed write must not lose the image the database still points to.
  for (const other of ['png', 'jpg', 'webp']) {
    if (other !== artwork.type) rmSync(join(folder, `${kind}.${other}`), { force: true })
  }
  return { localPath, width: artwork.width, height: artwork.height }
}

/** prepareArtwork + writeArtwork. */
export function importArtwork(options: {
  sourcePath: string
  cacheDir: string
  gameId: number
  kind: ArtworkKind
  decode: (bytes: Buffer) => { width: number; height: number } | null
}): ImportedArtwork {
  const prepared = prepareArtwork(options.sourcePath, options.kind, options.decode)
  return writeArtwork(options.cacheDir, options.gameId, options.kind, prepared)
}

/** Deletes a game's cached artwork folder (after the game row is removed). */
export function removeGameArtwork(cacheDir: string, gameId: number): void {
  rmSync(join(cacheDir, String(gameId)), { recursive: true, force: true })
}

/**
 * Size declared by a WebP header (VP8, VP8L or VP8X chunk). Electron's
 * nativeImage cannot decode WebP, so for this format the header is checked
 * instead of a full decode; the sandboxed renderer (Chromium) displays it.
 * Returns null when the header is not a valid WebP header.
 */
export function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (detectImageType(bytes) !== 'webp' || bytes.length < 30) return null
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunk = view.toString('ascii', 12, 16)
  if (chunk === 'VP8X') {
    return { width: 1 + view.readUIntLE(24, 3), height: 1 + view.readUIntLE(27, 3) }
  }
  if (chunk === 'VP8 ') {
    // Key frame start code 9d 01 2a, then 14-bit width and height.
    if (view[23] !== 0x9d || view[24] !== 0x01 || view[25] !== 0x2a) return null
    return { width: view.readUInt16LE(26) & 0x3fff, height: view.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (view[20] !== 0x2f) return null
    const bits = view.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return null
}
