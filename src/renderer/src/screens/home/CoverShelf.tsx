import type { GameSummary } from '../../../../shared/ipc/contract'
import { GameCard } from '../../components/GameCard'
import {
  coverWidthRem,
  homeCoverStyle,
  shelfSmallScale,
  useHomeCovers
} from '../../data/home-covers'
import { useCoverFocus } from './useCoverFocus'
import './CoverShelf.css'

/**
 * "Capas da home" › Embaixo and Em cima (D-27): a shelf close to the footer, or mirrored close
 * to the top bar, after the PS5 home (owner decisions); described here for "Embaixo". The focused square cover is the large one and stays where the first cover is; the
 * others are smaller by the name's height plus 10px, level with its bottom, and the name sits
 * next to it, above them. Each cover is placed and sized with a transform from its distance to
 * the focus, so changing the focus only animates transforms (CoverShelf.css).
 */
export function CoverShelf({
  side,
  games,
  onOpen,
  opensToPlay,
  onMenu,
  backdropTarget
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
}): React.JSX.Element {
  const covers = useHomeCovers().settings
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
            />
          </div>
        ))}
      </div>
      {focusedGame && (
        <p className="home-shelf__name" data-hidden={focus.infoHidden}>
          {focusedGame.title}
        </p>
      )}
    </div>
  )
}
