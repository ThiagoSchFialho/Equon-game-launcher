import type { GameSummary } from '../../../../shared/ipc/contract'
import homeClockIcon from '../../assets/icons/home-clock.svg'
import { GameCard } from '../../components/GameCard'
import { formatPlaytime } from '../../data/format'
import { homeCoverStyle, useHomeCovers } from '../../data/home-covers'
import { homeCardId, useCoverFocus } from './useCoverFocus'
import './CenteredCovers.css'

/**
 * "Capas da home" › Centro (D-27): portrait covers, all the same size, with the focused one in
 * the middle of the screen and its name and playtime under it.
 */
export function CenteredCovers({
  games,
  onOpen,
  opensToPlay,
  onMenu,
  backdropTarget
}: {
  games: GameSummary[]
  /** A on a cover: its page, or the game itself with "Ignorar tela do jogo na home" (D-28). */
  onOpen: (game: GameSummary) => void
  /** A plays the Play sound instead of the confirm one. */
  opensToPlay: boolean
  onMenu: (game: GameSummary) => void
  /** Where the background art goes: the whole Home screen, not just this row. */
  backdropTarget: HTMLElement | null
}): React.JSX.Element {
  const covers = useHomeCovers().settings
  const focus = useCoverFocus(games, backdropTarget)
  const focusedGame = games[focus.infoIndex]
  return (
    <div
      className="home__carousel"
      style={
        {
          '--index': focus.index,
          '--count': games.length,
          ...homeCoverStyle(covers)
        } as React.CSSProperties
      }
    >
      {focus.backdrop}
      {/* The focused card goes to the middle; the track moves with transform. */}
      <div className="home__track">
        {games.map((game, i) => (
          <div key={game.id} className="home__slot">
            <GameCard
              game={game}
              variant="portrait"
              focusId={homeCardId(game)}
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
        <div
          className="home__focused-info"
          data-hidden={focus.infoHidden}
          style={{ '--index': focus.infoIndex } as React.CSSProperties}
        >
          <p className="home__title">{focusedGame.title}</p>
          {focusedGame.playtime > 0 && (
            <p className="home__playtime">
              <img src={homeClockIcon} alt="" />
              {formatPlaytime(focusedGame.playtime)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
