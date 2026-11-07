import type { GameSummary } from '../../../shared/ipc/contract'
import type { FocusableOptions } from '../focus/focus-manager'
import { useFocusable } from '../focus/focus-context'
import beatenIcon from '../assets/icons/badge-beaten.svg'
import hiddenIcon from '../assets/icons/badge-hidden.svg'
import installedIcon from '../assets/icons/badge-installed.svg'
import { t } from '../strings'
import { Artwork } from './Artwork'
import './GameCard.css'

interface Props extends FocusableOptions {
  game: GameSummary
  variant: 'square' | 'portrait'
  /** The value the Library is sorted by, shown at the bottom right. */
  stat?: string | null
}

/** Focusable game card: square cover in the Library, portrait cover on Home. */
export function GameCard({ game, variant, stat, ...focusOptions }: Props): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(
    `game-card:${variant}:${game.id}`,
    focusOptions
  )
  // Home only lists installed games, so these two say something only in the Library.
  const badges = [
    game.hidden && { label: t.library.hiddenBadge, icon: hiddenIcon },
    variant === 'square' &&
      game.installed === true && { label: t.library.installedBadge, icon: installedIcon },
    variant === 'square' && game.beated && { label: t.library.beatenBadge, icon: beatenIcon }
  ].filter((badge) => badge !== false)
  return (
    <button
      ref={setElement}
      className={`game-card game-card--${variant}`}
      data-focused={focused}
      data-hidden={game.hidden}
      aria-label={game.title}
      aria-description={
        [...badges.map((badge) => badge.label), ...(stat ? [stat] : [])].join(', ') || undefined
      }
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
      {badges.length > 0 && (
        <span className="game-card__badges">
          {badges.map((badge) => (
            <span key={badge.label} className="game-card__badge" title={badge.label}>
              <img src={badge.icon} alt="" />
            </span>
          ))}
        </span>
      )}
      {stat && <span className="game-card__stat">{stat}</span>}
    </button>
  )
}
