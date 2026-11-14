import { useCallback, useRef, useState } from 'react'
import { HOME_GAMES_LIMIT, type GameSummary } from '../../../shared/ipc/contract'
import { hasSection, useNavigation } from '../app/navigation'
import { Footer, type Hint } from '../components/Footer'
import { GameOptionsLayer } from '../components/GameOptionsLayer'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { useHomeCovers } from '../data/home-covers'
import { useHomeLaunch } from '../data/home-launch'
import { useFocusManager, useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { homeGames } from '../../../shared/library-view'
import { t } from '../strings'
import { CenteredCovers } from './home/CenteredCovers'
import { CoverShelf } from './home/CoverShelf'
import { SPOTLIGHT_PREFIX } from './home/GameSpotlight'
import { TopHome } from './home/TopHome'
import { HOME_SCOPE, homeCardId } from './home/useCoverFocus'
import { useUiSounds } from '../sound/sound-context'
import './HomeScreen.css'

const hints = (directLaunch: boolean): Hint[] => [
  { button: 'LB/RB', label: t.hints.navigate },
  { button: 'menu', label: t.hints.options },
  // A starts the game, so X opens its page (owner decision, D-28).
  ...(directLaunch ? [{ button: 'X', label: t.hints.details } satisfies Hint] : []),
  { button: 'A', label: directLaunch ? t.hints.play : t.hints.open }
]
const MENU_HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

export function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const manager = useFocusManager()
  const sounds = useUiSounds()
  const { games, reload, markLaunched } = useGames()
  const [menuGame, setMenuGame] = useState<GameSummary | null>(null)
  const [homeElement, setHomeElement] = useState<HTMLDivElement | null>(null)
  // "Capas da home" › Posição (D-27): "Centro" is its own layout; "Em cima" and "Embaixo" are
  // the same shelf, mirrored, and "Em cima" adds a panel under it (D-29).
  const covers = useHomeCovers().settings
  const position = covers.position
  const { directLaunch } = useHomeLaunch()
  // The game "Em cima"'s panel shows, for X while the focus is in the panel.
  const panelGame = useRef<GameSummary | null>(null)
  const setPanelGame = useCallback((game: GameSummary | null) => {
    panelGame.current = game
  }, [])
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
      .then((result) => (result.ok ? markLaunched(game.id) : failed()), failed)
      .finally(() => {
        launching.current = false
      })
  }

  // "Limitar quantidade de jogos na home" (D-31): the most recently played first, so the limit
  // keeps the latest ones.
  const all = games.status === 'ready' ? homeGames(games.data) : []
  const shown = covers.limited ? all.slice(0, HOME_GAMES_LIMIT) : all

  useScreenActions({
    // At either end there is no handler, so LB/RB do nothing and play no sound.
    previousSection: hasSection('home', -1) ? () => navigation.stepSection(-1) : undefined,
    nextSection: hasSection('home', 1) ? () => navigation.stepSection(1) : undefined,
    // With "Ignorar tela do jogo na home", X on a cover opens the game's page (owner decision).
    secondary: directLaunch
      ? () => {
          const focused = manager.focusedId
          // On a cover, its game; in "Em cima"'s panel, the game the panel shows (owner decision).
          const game =
            shown.find((candidate) => homeCardId(candidate) === focused) ??
            (focused?.startsWith(SPOTLIGHT_PREFIX) ? panelGame.current : null)
          if (!game) return
          sounds.play('confirm')
          // Back from the game page, the Home comes back to its cover.
          manager.focus(homeCardId(game))
          navigation.openGame(game.id)
        }
      : undefined
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
  } else if (shown.length === 0) {
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
          games={shown}
          onOpen={open}
          opensToPlay={directLaunch}
          onMenu={setMenuGame}
          backdropTarget={homeElement}
        />
      ) : position === 'top' ? (
        // "Em cima" adds the focused game's panel under the shelf (D-29).
        <TopHome
          games={shown}
          onOpen={open}
          opensToPlay={directLaunch}
          onMenu={setMenuGame}
          backdropTarget={homeElement}
          onPanelGame={setPanelGame}
        />
      ) : (
        <CoverShelf
          side={position}
          games={shown}
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
