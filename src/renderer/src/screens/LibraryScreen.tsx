import { useState } from 'react'
import type { GameSummary } from '../../../shared/ipc/contract'
import { useNavigation } from '../app/navigation'
import { Footer, type Hint } from '../components/Footer'
import { GameCard } from '../components/GameCard'
import { OptionsMenu } from '../components/OptionsMenu'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { useFocusManager, useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import './LibraryScreen.css'

// Search (Y) and filters (X) arrive in Phase 5.
const HINTS: Hint[] = [
  { button: 'LB/RB', label: t.hints.navigate },
  { button: 'menu', label: t.hints.options },
  { button: 'A', label: t.hints.open }
]
const MENU_HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

export function LibraryScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const { games, reload } = useGames()
  const [menuGame, setMenuGame] = useState<GameSummary | null>(null)
  const focus = useFocusManager()

  // Right stick / Page Up-Down: move a page (two rows) at a time.
  const page = (direction: 'up' | 'down') => (): void => {
    focus.handle(direction)
    focus.handle(direction)
  }
  useScreenActions({
    previousSection: () => navigation.stepSection(-1),
    nextSection: () => navigation.stepSection(1),
    scrollUp: page('up'),
    scrollDown: page('down')
  })

  let content: React.JSX.Element
  if (games.status === 'loading') {
    content = <StateMessage message={t.library.loading} />
  } else if (games.status === 'error') {
    content = (
      <StateMessage
        tone="error"
        message={t.library.error}
        action={{ id: 'library:retry', label: t.library.retry, onConfirm: reload }}
      />
    )
  } else if (games.data.length === 0) {
    content = <StateMessage message={t.library.empty} hint={t.library.emptyHint} />
  } else {
    content = (
      <div className="library__grid">
        {games.data.map((game) => (
          <GameCard
            key={game.id}
            game={game}
            variant="square"
            scroll="center"
            onConfirm={() => navigation.openGame(game.id)}
            onMenu={() => setMenuGame(game)}
          />
        ))}
      </div>
    )
  }

  return (
    <FocusScope id="screen:library">
      <div className="screen">
        <TopBar active="library" />
        <main className="screen__main library">
          <header className="library__header">
            <h1 className="library__title">{t.library.title}</h1>
            {games.status === 'ready' && (
              <span className="library__count">{t.library.count(games.data.length)}</span>
            )}
          </header>
          <div className="library__scroll">{content}</div>
        </main>
        <Footer hints={menuGame ? MENU_HINTS : HINTS} />
      </div>
      {menuGame && (
        <OptionsMenu
          title={menuGame.title}
          beated={menuGame.beated}
          onClose={() => setMenuGame(null)}
        />
      )}
    </FocusScope>
  )
}
