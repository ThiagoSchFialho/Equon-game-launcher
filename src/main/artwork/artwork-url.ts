import { z } from 'zod'
import {
  ARTWORK_EDIT_KINDS,
  ARTWORK_SCHEME,
  type ArtworkEditKind,
  type ArtworkKind
} from '../../shared/ipc/contract'
import { artworkKindSchema } from '../../shared/ipc/schemas'

/** The parts every address of this scheme must leave empty. */
function plainUrl(url: string): URL | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === `${ARTWORK_SCHEME}:` &&
      parsed.port === '' &&
      parsed.username === '' &&
      parsed.hash === ''
      ? parsed
      : null
  } catch {
    return null
  }
}

/** Parses `equon-art://draft/<kind>?v=<version>`, an image chosen but not saved yet. */
export function parseDraftArtworkUrl(url: string): ArtworkEditKind | null {
  const parsed = plainUrl(url)
  if (parsed?.hostname !== 'draft' || !/^(\?v=\d{1,12})?$/.test(parsed.search)) return null
  const kind = z.enum(ARTWORK_EDIT_KINDS).safeParse(parsed.pathname.slice(1))
  return kind.success ? kind.data : null
}

/** Parses `equon-art://grid/<assetId>`, a thumbnail of the SteamGridDB gallery. */
export function parseGridThumbnailUrl(url: string): number | null {
  const parsed = plainUrl(url)
  if (parsed?.hostname !== 'grid' || parsed.search !== '') return null
  const match = /^\/([1-9]\d{0,15})$/.exec(parsed.pathname)
  return match ? Number(match[1]) : null
}

/** Parses `equon-art://achievement/<id>/<locked|unlocked>`; anything else is rejected. */
export function parseAchievementIconUrl(url: string): { id: number; locked: boolean } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (
    parsed.protocol !== `${ARTWORK_SCHEME}:` ||
    parsed.hostname !== 'achievement' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    return null
  }
  const match = /^\/([1-9]\d{0,15})\/(locked|unlocked)$/.exec(parsed.pathname)
  return match ? { id: Number(match[1]), locked: match[2] === 'locked' } : null
}

/**
 * Parses `equon-art://game/<gameId>/<kind>[?v=<version>]`; anything else is rejected. The id
 * lives in the path because the scheme is "standard" and Chromium would turn
 * a numeric host into an IPv4 address (1 → 0.0.0.1).
 */
export function parseArtworkUrl(url: string): { gameId: number; kind: ArtworkKind } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (
    parsed.protocol !== `${ARTWORK_SCHEME}:` ||
    parsed.hostname !== 'game' ||
    parsed.port !== '' ||
    parsed.username !== '' ||
    // Only tells the browser the image changed; nothing here reads it.
    !/^(\?v=[\w%.:-]{1,64})?$/.test(parsed.search) ||
    parsed.hash !== ''
  ) {
    return null
  }
  const match = /^\/([1-9]\d{0,15})\/([a-z_]+)$/.exec(parsed.pathname)
  if (!match) return null
  const kind = artworkKindSchema.safeParse(match[2])
  if (!kind.success) return null
  return { gameId: Number(match[1]), kind: kind.data }
}
