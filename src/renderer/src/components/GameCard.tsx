import type { GameSummary } from '../../../shared/ipc/contract'
import type { FocusableOptions } from '../focus/focus-manager'
import { useFocusable } from '../focus/focus-context'
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
      aria-label={game.title}
      tabIndex={-1}
      {...mouse}
    >
      <Artwork
        gameId={game.id}
        kind={variant === 'square' ? 'cover_square' : 'cover_portrait'}
        available={game.artwork}
        title={game.title}
        className="game-card__art"
      />
    </button>
  )
}
