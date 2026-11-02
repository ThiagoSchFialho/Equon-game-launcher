import { ARTWORK_SCHEME, type ArtworkKind } from '../../shared/ipc/contract'
import { artworkKindSchema } from '../../shared/ipc/schemas'

/**
 * Parses `equon-art://game/<gameId>/<kind>`; anything else is rejected. The id
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
    parsed.search !== '' ||
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
