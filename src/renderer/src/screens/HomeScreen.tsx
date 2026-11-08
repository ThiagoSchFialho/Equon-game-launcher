import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameSummary } from '../../../shared/ipc/contract'
import homeClockIcon from '../assets/icons/home-clock.svg'
import { useNavigation } from '../app/navigation'
import { Footer, type Hint } from '../components/Footer'
import { GameCard } from '../components/GameCard'
import { GameOptionsLayer } from '../components/GameOptionsLayer'
import { HomeArtBackdrop } from '../components/HomeArtBackdrop'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { formatPlaytime } from '../data/format'
import { useGames } from '../data/games'
import { homeArtUrl, useHomeArt } from '../data/home-art'
import { useFocusManager, useScreenActions } from '../focus/focus-context'
import { prefersReducedMotion } from '../focus/focus-manager'
import { FocusScope } from '../focus/FocusProvider'
import { homeGames } from '../../../shared/library-view'
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

const HOME_SCOPE = 'screen:home'
/** Each half of the name's fade: half of --motion-focus (HomeScreen.css). */
const INFO_FADE_MS = 70
/**
 * The background art (D-25) changes once the focus stops: a held direction would otherwise
 * swap a large blurred image every 110 ms.
 */
const ART_SETTLE_MS = 150

function Carousel({
  games,
  onMenu,
  backdropTarget
}: {
  games: GameSummary[]
  onMenu: (game: GameSummary) => void
  /** Where the background art goes: the whole Home screen, not just this carousel. */
  backdropTarget: HTMLElement | null
}): React.JSX.Element {
  const homeArt = useHomeArt().settings
  const navigation = useNavigation()
  const manager = useFocusManager()
  // Coming back: starts on the restored game, so the track does not travel to it on screen.
  const [index, setIndex] = useState(() => {
    const restored = manager.rememberedFocus(HOME_SCOPE)
    return Math.max(
      games.findIndex((game) => `game-card:portrait:${game.id}` === restored),
      0
    )
  })
  // The name and playtime fade out, move while hidden and fade in under the new card.
  const [infoIndex, setInfoIndex] = useState(index)
  const [infoHidden, setInfoHidden] = useState(false)
  const infoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The background art: the games of the last two images, the newest fading in on top. Empty
  // until the first focus, which may land on another card than the one guessed here.
  const [artLayers, setArtLayers] = useState<number[]>([])
  const artTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (infoTimer.current) clearTimeout(infoTimer.current)
      if (artTimer.current) clearTimeout(artTimer.current)
    },
    []
  )
  const showArt = (game: GameSummary | undefined): void => {
    if (!game) return
    setArtLayers((layers) => {
      if (layers.at(-1) === game.id) return layers
      // No fade without motion, or onto a game with no art: straight to the new one.
      if (prefersReducedMotion() || homeArtUrl(game) === null) return [game.id]
      return [...layers.slice(-1), game.id]
    })
  }
  const focusCard = (i: number): void => {
    setIndex(i)
    // The first focus (the screen opening or coming back) shows its art at once, without a fade.
    const opening = games[i]
    if (opening) setArtLayers((layers) => (layers.length === 0 ? [opening.id] : layers))
    if (artTimer.current) clearTimeout(artTimer.current)
    artTimer.current = setTimeout(() => {
      artTimer.current = null
      showArt(games[i])
    }, ART_SETTLE_MS)
    // Already there, as when the screen opens or comes back: nothing to fade.
    if (i === infoIndex && !infoTimer.current) return
    if (infoTimer.current) clearTimeout(infoTimer.current)
    // A held direction keeps it hidden: it only shows where the focus stops.
    setInfoHidden(true)
    infoTimer.current = setTimeout(
      () => {
        infoTimer.current = null
        setInfoIndex(i)
        setInfoHidden(false)
      },
      prefersReducedMotion() ? 0 : INFO_FADE_MS
    )
  }
  const focusedGame = games[Math.min(infoIndex, games.length - 1)]
  const byId = new Map(games.map((game) => [game.id, game]))
  const backdrop =
    homeArt.enabled && backdropTarget
      ? createPortal(
          <HomeArtBackdrop
            layers={artLayers.flatMap((id) => {
              const game = byId.get(id)
              return game ? [{ gameId: id, url: homeArtUrl(game) }] : []
            })}
            blur={homeArt.blur}
            dim={homeArt.dim}
            onSettled={() => setArtLayers((layers) => layers.slice(-1))}
          />,
          backdropTarget
        )
      : null
  return (
    <div
      className="home__carousel"
      style={{ '--index': index, '--count': games.length } as React.CSSProperties}
    >
      {backdrop}
      {/* The focused card goes to the middle; the track moves with transform (HomeScreen.css). */}
      <div className="home__track">
        {games.map((game, i) => (
          <div key={game.id} className="home__slot">
            <GameCard
              game={game}
              variant="portrait"
              scroll="none"
              autoFocus={i === 0}
              onFocus={() => focusCard(i)}
              onConfirm={() => navigation.openGame(game.id)}
              onMenu={() => onMenu(game)}
            />
          </div>
        ))}
      </div>
      {focusedGame && (
        <div
          className="home__focused-info"
          data-hidden={infoHidden}
          style={{ '--index': infoIndex } as React.CSSProperties}
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

export function HomeScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const { games, reload } = useGames()
  const [menuGame, setMenuGame] = useState<GameSummary | null>(null)
  const [homeElement, setHomeElement] = useState<HTMLDivElement | null>(null)

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
    content = (
      <Carousel games={homeGames(games.data)} onMenu={setMenuGame} backdropTarget={homeElement} />
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
