import { useState } from 'react'
import type { GameSummary } from '../../../shared/ipc/contract'
import homeClockIcon from '../assets/icons/home-clock.svg'
import { useNavigation } from '../app/navigation'
import { Footer, type Hint } from '../components/Footer'
import { GameCard } from '../components/GameCard'
import { GameOptionsLayer } from '../components/GameOptionsLayer'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { formatPlaytime } from '../data/format'
import { homeGames, useGames } from '../data/games'
import { useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import './HomeScreen.css'

const HINTS: Hint[] = [
  { button: 'LB/RB', label: t.hints.navigate },
  { button: 'menu', label: t.hints.options },
  { button: 'A', label: t.hints.open }
]
const MENU_HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

function Carousel({
  games,
  onMenu
}: {
  games: GameSummary[]
  onMenu: (game: GameSummary) => void
}): React.JSX.Element {
  const navigation = useNavigation()
  const [index, setIndex] = useState(0)
  const focusedGame = games[Math.min(index, games.length - 1)]
  return (
    <div className="home__carousel">
      {/* The focused card stays at a fixed position; the track moves with transform. */}
      <div className="home__track" style={{ '--index': index } as React.CSSProperties}>
        {games.map((game, i) => (
          <div key={game.id} className="home__slot" data-before={i < index}>
            <GameCard
              game={game}
              variant="portrait"
              scroll="none"
              autoFocus={i === 0}
              onFocus={() => setIndex(i)}
              onConfirm={() => navigation.openGame(game.id)}
              onMenu={() => onMenu(game)}
            />
          </div>
        ))}
      </div>
      {focusedGame && (
        <div className="home__focused-info">
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

export function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const { games, reload } = useGames()
  const [menuGame, setMenuGame] = useState<GameSummary | null>(null)

  useScreenActions({
    previousSection: () => navigation.stepSection(-1),
    nextSection: () => navigation.stepSection(1)
  })

  let content: React.JSX.Element
  if (games.status === 'loading') {
    content = <StateMessage message={t.library.loading} />
  } else if (games.status === 'error') {
    content = (
      <StateMessage
        tone="error"
        message={t.library.error}
        action={{ id: 'home:retry', label: t.library.retry, onConfirm: reload }}
      />
    )
  } else if (games.data.length === 0) {
    content = (
      <StateMessage
        message={t.home.empty}
        hint={t.library.emptyHint}
        action={{
          id: 'home:open-library',
          label: t.home.openLibrary,
          onConfirm: () => navigation.goToSection('library')
        }}
      />
    )
  } else {
    content = <Carousel games={homeGames(games.data)} onMenu={setMenuGame} />
  }

  return (
    <FocusScope id="screen:home">
      <div className="screen">
        <TopBar active="home" />
        <main className="screen__main">{content}</main>
        <Footer hints={menuGame ? MENU_HINTS : HINTS} />
      </div>
      {menuGame && <GameOptionsLayer game={menuGame} onClose={() => setMenuGame(null)} />}
    </FocusScope>
  )
}
