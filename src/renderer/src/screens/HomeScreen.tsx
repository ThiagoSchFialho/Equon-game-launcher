import { useRef, useState } from 'react'
import type { GameSummary } from '../../../shared/ipc/contract'
import { useNavigation } from '../app/navigation'
import { Footer, type Hint } from '../components/Footer'
import { GameOptionsLayer } from '../components/GameOptionsLayer'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { useHomeCovers } from '../data/home-covers'
import { useHomeLaunch } from '../data/home-launch'
import { useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { homeGames } from '../../../shared/library-view'
import { t } from '../strings'
import { CenteredCovers } from './home/CenteredCovers'
import { CoverShelf } from './home/CoverShelf'
import { HOME_SCOPE } from './home/useCoverFocus'
import './HomeScreen.css'

const hints = (directLaunch: boolean): Hint[] => [
  { button: 'LB/RB', label: t.hints.navigate },
  { button: 'menu', label: t.hints.options },
  { button: 'A', label: directLaunch ? t.hints.play : t.hints.open }
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
  const { directLaunch } = useHomeLaunch()
  // One launch at a time: a second A while the first is on its way does nothing.
  const launching = useRef(false)

  /**
   * A on a cover (D-28): with "Ignorar tela do jogo na home", the game starts like Jogar does
   * (launch image, session). If it cannot start, the Home screen has nowhere to say why, so the
   * game's page opens and explains it.
   */
  const open = (game: GameSummary): void => {
    if (!directLaunch) {
      navigation.openGame(game.id)
      return
    }
    if (launching.current) return
    launching.current = true
    const failed = (): void => navigation.openGame(game.id)
    void window.equon.games
      .launch(game.id)
      .then((result) => (result.ok ? undefined : failed()), failed)
      .finally(() => {
        launching.current = false
      })
  }

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
          onOpen={open}
          opensToPlay={directLaunch}
          onMenu={setMenuGame}
          backdropTarget={homeElement}
        />
      ) : (
        <CoverShelf
          side={position}
          games={homeGames(games.data)}
          onOpen={open}
          opensToPlay={directLaunch}
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
        <Footer hints={menuGame ? MENU_HINTS : hints(directLaunch)} />
      </div>
      {menuGame && (
        <GameOptionsLayer
          game={menuGame}
          // A starts the game, so its page is offered here (D-28).
          onOpenPage={directLaunch ? () => navigation.openGame(menuGame.id) : undefined}
          onClose={() => setMenuGame(null)}
        />
      )}
    </FocusScope>
  )
}
