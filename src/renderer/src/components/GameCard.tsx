import type { GameSummary } from '../../../shared/ipc/contract'
import type { FocusableOptions } from '../focus/focus-manager'
import { useFocusable } from '../focus/focus-context'
import { t } from '../strings'
import { Artwork } from './Artwork'
import './GameCard.css'

interface Props extends FocusableOptions {
  game: GameSummary
  variant: 'square' | 'portrait'
}

/** Focusable game card: square cover in the Library, portrait cover on Home. */
export function GameCard({ game, variant, ...focusOptions }: Props): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(
    `game-card:${variant}:${game.id}`,
    focusOptions
  )
  return (
    <button
      ref={setElement}
      className={`game-card game-card--${variant}`}
      data-focused={focused}
      data-hidden={game.hidden}
      aria-label={game.title}
      tabIndex={-1}
      {...mouse}
    >
      <Artwork
        gameId={game.id}
        kind={variant === 'square' ? 'cover_square' : 'cover_portrait'}
        available={game.artwork}
        version={game.artworkVersion}
        title={game.title}
        className="game-card__art"
      />
      {game.hidden && <span className="game-card__badge">{t.library.hiddenBadge}</span>}
    </button>
  )
}
