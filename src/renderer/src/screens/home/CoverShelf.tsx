import type { GameSummary } from '../../../../shared/ipc/contract'
import { GameCard } from '../../components/GameCard'
import { useFocusable } from '../../focus/focus-context'
import {
  coverWidthRem,
  homeCoverStyle,
  shelfSmallScale,
  shownCovers,
  useHomeCovers
} from '../../data/home-covers'
import { useCoverFocus } from './useCoverFocus'
import './CoverShelf.css'

/**
 * "Capas da home" › Embaixo and Em cima (D-27): a shelf close to the footer, or mirrored close
 * to the top bar, after the PS5 home (owner decisions); described here for "Embaixo". The
 * focused square cover is the large one and stays where the first cover is; the others are smaller by the name's height plus 10px, level with its bottom, and the name sits
 * next to it, above them. Each cover is placed and sized with a transform from its distance to
 * the focus, so changing the focus only animates transforms (CoverShelf.css).
 */
export function CoverShelf({
  side,
  games,
  onOpen,
  opensToPlay,
  onMenu,
  backdropTarget,
  below,
  onCardDown,
  leading
}: {
  /** "Embaixo" by the footer, or "Em cima" by the top bar: the same shelf, mirrored. */
  side: 'top' | 'bottom'
  games: GameSummary[]
  /** A on a cover: its page, or the game itself with "Ignorar tela do jogo na home" (D-28). */
  onOpen: (game: GameSummary) => void
  /** A plays the Play sound instead of the confirm one. */
  opensToPlay: boolean
  onMenu: (game: GameSummary) => void
  /** Where the background art goes: the whole Home screen, not just this shelf. */
  backdropTarget: HTMLElement | null
  /**
   * Drawn inside the shelf, after the covers ("Em cima"'s panel, D-29): the focused game, hidden
   * while the name fades, and the focus id of its cover, to come back to.
   */
  below?: (shelf: {
    game: GameSummary | undefined
    hidden: boolean
    cardId: string | null
  }) => React.ReactNode
  /** Down on the focused cover; true when it used the direction ("Em cima": always). */
  onCardDown?: (game: GameSummary) => boolean
  /**
   * A shortcut drawn as a cover before the first game ("Em cima"'s Configurações, D-32). It sits
   * at index -1: the focus still starts on the first game.
   */
  leading?: { id: string; label: string; icon: string; onConfirm: () => void }
}): React.JSX.Element {
  const covers = shownCovers(useHomeCovers().settings)
  const focus = useCoverFocus(games, 'square', backdropTarget)
  const focusedGame = games[focus.infoIndex]
  return (
    <div
      className="home-shelf"
      data-side={side}
      style={
        {
          ...homeCoverStyle(covers),
          '--small-scale': shelfSmallScale(coverWidthRem(covers))
        } as React.CSSProperties
      }
    >
      {focus.backdrop}
      <div className="home-shelf__row">
        {leading && (
          <div
            className="home-shelf__slot"
            data-current={focus.index === -1}
            style={{ '--rel': -1 - focus.index } as React.CSSProperties}
          >
            <ShelfShortcut {...leading} onFocus={() => focus.focusCard(-1)} />
          </div>
        )}
        {games.map((game, i) => (
          <div
            key={game.id}
            className="home-shelf__slot"
            data-current={i === focus.index}
            style={{ '--rel': i - focus.index } as React.CSSProperties}
          >
            <GameCard
              game={game}
              variant="square"
              statusBadges={false}
              scroll="none"
              autoFocus={i === 0}
              onFocus={() => focus.focusCard(i)}
              confirmSound={opensToPlay ? 'play' : undefined}
              onConfirm={() => onOpen(game)}
              onMenu={() => onMenu(game)}
              onDirection={
                onCardDown ? (direction) => direction === 'down' && onCardDown(game) : undefined
              }
            />
          </div>
        ))}
      </div>
      {(focusedGame || (leading && focus.infoIndex === -1)) && (
        <p className="home-shelf__name" data-hidden={focus.infoHidden}>
          {focusedGame ? focusedGame.title : leading?.label}
        </p>
      )}
      {below?.({
        game: focusedGame,
        hidden: focus.infoHidden,
        cardId: focusedGame ? `game-card:square:${focusedGame.id}` : null
      })}
    </div>
  )
}

/** A cover-shaped shortcut: a see-through dark square with an icon, focused like a cover. */
function ShelfShortcut({
  id,
  label,
  icon,
  onConfirm,
  onFocus
}: {
  id: string
  label: string
  icon: string
  onConfirm: () => void
  onFocus: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    onConfirm,
    onFocus,
    scroll: 'none'
  })
  return (
    <button
      ref={setElement}
      className="game-card home-shelf__shortcut"
      data-focused={focused}
      aria-label={label}
      tabIndex={-1}
      {...mouse}
    >
      <img src={icon} alt="" />
    </button>
  )
}
