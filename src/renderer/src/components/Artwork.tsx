import { useState } from 'react'
import { artworkUrl, type ArtworkKind } from '../../../shared/ipc/contract'
import './Artwork.css'

interface Props {
  gameId: number
  kind: ArtworkKind
  /** Kinds the game has in the cache (from GameSummary.artwork). */
  available: readonly ArtworkKind[]
  /** From the game summary: a new value means the image was replaced. */
  version?: string | null
  /** Shown inside the placeholder when there is no image. */
  title: string
  className?: string
  /** Lazy for long grids; eager for hero images. */
  loading?: 'lazy' | 'eager'
}

/**
 * Cached artwork served by main (equon-art://), faded in when decoded. Falls
 * back to a placeholder in the kind's own proportion when the game has no art
 * of that kind or the image fails to load.
 */
export function Artwork({
  gameId,
  kind,
  available,
  version,
  title,
  className = '',
  loading = 'lazy'
}: Props): React.JSX.Element {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading')
  const hasImage = available.includes(kind) && state !== 'failed'

  return (
    <div className={`artwork artwork--${kind} ${className}`} data-state={hasImage ? state : 'none'}>
      {(!hasImage || state !== 'loaded') && (
        <div className="artwork__placeholder" aria-hidden={hasImage}>
          {!hasImage && <span>{title}</span>}
        </div>
      )}
      {hasImage && (
        <img
          className="artwork__image"
          src={artworkUrl(gameId, kind, version)}
          alt=""
          loading={loading}
          decoding="async"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </div>
  )
}
