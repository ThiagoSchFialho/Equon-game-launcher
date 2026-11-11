import { useState } from 'react'
import type { GameSummary } from '../../../shared/ipc/contract'
import { useNavigation } from '../app/navigation'
import { Footer, type Hint } from '../components/Footer'
import { GameOptionsLayer } from '../components/GameOptionsLayer'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { useHomeCovers } from '../data/home-covers'
import { useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { homeGames } from '../../../shared/library-view'
import { t } from '../strings'
import { CenteredCovers } from './home/CenteredCovers'
import { CoverShelf } from './home/CoverShelf'
import { HOME_SCOPE } from './home/useCoverFocus'
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

export function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const { games, reload } = useGames()
  const [menuGame, setMenuGame] = useState<GameSummary | null>(null)
  const [homeElement, setHomeElement] = useState<HTMLDivElement | null>(null)
  // "Capas da home" › Posição (D-27): "Centro" is its own layout; "Em cima" and "Embaixo" are
  // the same shelf, mirrored.
  const position = useHomeCovers().settings.position

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
  } else if (homeGames(games.data).length === 0) {
    content = (
      <StateMessage
        message={t.home.empty}
        hint={t.home.emptyHint}
        action={{
          id: 'home:open-library',
          label: t.home.openLibrary,
          onConfirm: () => navigation.goToSection('library')
        }}
      />
    )
  } else {
    content =
      position === 'center' ? (
        <CenteredCovers
          games={homeGames(games.data)}
          onMenu={setMenuGame}
          backdropTarget={homeElement}
        />
      ) : (
        <CoverShelf
          side={position}
          games={homeGames(games.data)}
          onMenu={setMenuGame}
          backdropTarget={homeElement}
        />
      )
  }

  return (
    <FocusScope id={HOME_SCOPE}>
      <div className="screen home" ref={setHomeElement}>
        <TopBar active="home" />
        <main className="screen__main">{content}</main>
        <Footer hints={menuGame ? MENU_HINTS : HINTS} />
      </div>
      {menuGame && <GameOptionsLayer game={menuGame} onClose={() => setMenuGame(null)} />}
    </FocusScope>
  )
}
