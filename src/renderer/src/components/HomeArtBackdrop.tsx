import './HomeArtBackdrop.css'

export interface BackdropLayer {
  /** The game whose art it is; also the key, so a new game is a new image that fades in. */
  gameId: number
  url: string | null
}

/**
 * The focused game's art behind the Home screen (D-25), blurred and darkened as set in
 * Configurações › Aparência. A new image fades in over the previous one, which leaves when the
 * fade ends (`onSettled`).
 */
export function HomeArtBackdrop({
  layers,
  blur,
  dim,
  onSettled
}: {
  layers: BackdropLayer[]
  /** Level 0 to 10. */
  blur: number
  /** Percent. */
  dim: number
  onSettled: () => void
}): React.JSX.Element | null {
  const shown = layers.filter((layer) => layer.url !== null)
  if (shown.length === 0) return null
  return (
    <div
      className="home-art"
      aria-hidden
      style={{ '--home-art-blur': blur, '--home-art-dim': dim / 100 } as React.CSSProperties}
    >
      {shown.map((layer, i) => (
        <img
          key={layer.gameId}
          className="home-art__image"
          src={layer.url ?? undefined}
          alt=""
          data-entering={shown.length > 1 && i === shown.length - 1}
          onAnimationEnd={onSettled}
        />
      ))}
      <div className="home-art__dim" />
    </div>
  )
}
