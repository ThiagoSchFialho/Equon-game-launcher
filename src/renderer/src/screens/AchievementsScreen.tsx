import { useMemo, useState } from 'react'
import { sortAchievementGames } from '../../../shared/achievements-view'
import type { AchievementGameSummary, AchievementSyncStatus } from '../../../shared/ipc/contract'
import chevronIcon from '../assets/icons/arrow-right.svg'
import steamIcon from '../assets/icons/steam-white.svg'
import syncIcon from '../assets/icons/sync.svg'
import trophyIcon from '../assets/icons/trophy.svg'
import { useNavigation } from '../app/navigation'
import { Artwork } from '../components/Artwork'
import { Button } from '../components/Button'
import { Footer, type Hint } from '../components/Footer'
import { StateMessage } from '../components/StateMessage'
import { ToolbarField } from '../components/ToolbarField'
import { TopBar } from '../components/TopBar'
import { ProgressBar, TrophyRow } from '../components/Trophies'
import {
  useAchievementSort,
  useAchievementsOverview,
  useAchievementSyncStatus
} from '../data/achievements'
import { useFocusable, useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import './AchievementsScreen.css'

const HINTS: Hint[] = [
  { button: 'LB/RB', label: t.hints.navigate },
  { button: 'X', label: t.achievements.changeSort },
  { button: 'Y', label: t.achievements.syncShort },
  { button: 'A', label: t.hints.open }
]

/** Achievements overview (mockup "Achievements", PRODUCT.md §6.8). */
export function AchievementsScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const { sort, setSort } = useAchievementSort()
  const [attempt, setAttempt] = useState(0)
  const overview = useAchievementsOverview(attempt)
  const syncStatus = useAchievementSyncStatus()
  const status = syncStatus.status === 'ready' ? syncStatus.data : null
  const running = status?.running ?? false

  const sync = (): void => {
    if (!running) void window.equon.achievements.syncAll()
  }
  const toggleSort = (): void => setSort(sort === 'recent' ? 'completion' : 'recent')

  useScreenActions({
    previousSection: () => navigation.stepSection(-1),
    nextSection: () => navigation.stepSection(1),
    secondary: toggleSort,
    tertiary: sync
  })

  const games = useMemo(
    () => (overview.status === 'ready' ? sortAchievementGames(overview.data.games, sort) : []),
    [overview, sort]
  )

  let content: React.JSX.Element
  if (overview.status === 'loading') {
    content = <StateMessage message={t.achievements.loading} />
  } else if (overview.status === 'error') {
    content = (
      <StateMessage
        tone="error"
        message={t.achievements.error}
        action={{
          id: 'achievements:retry',
          label: t.library.retry,
          onConfirm: () => setAttempt((n) => n + 1)
        }}
      />
    )
  } else if (games.length === 0) {
    content = (
      <StateMessage
        icon={trophyIcon}
        message={overview.data.neverSynced ? t.achievements.neverSynced : t.achievements.empty}
        hint={overview.data.neverSynced ? t.achievements.neverSyncedHint : undefined}
      />
    )
  } else {
    content = (
      <div className="achievements__list">
        {games.map((game, index) => (
          <GameRow key={game.id} game={game} autoFocus={index === 0} />
        ))}
      </div>
    )
  }

  return (
    <FocusScope id="screen:achievements">
      <div className="screen">
        <TopBar active="achievements" />
        <main className="screen__main achievements">
          <div className="achievements__header">
            <h1 className="achievements__title">{t.achievements.title}</h1>
            <p className="achievements__status" aria-live="polite">
              {statusText(status)}
            </p>
            {/* After the list loads, so its first game gets the initial focus. */}
            {overview.status === 'ready' && (
              <>
                <ToolbarField
                  id="achievements:sort"
                  kind="select"
                  label={t.library.sort}
                  value={t.achievements.sorts[sort]}
                  onConfirm={toggleSort}
                />
                <Button
                  id="achievements:sync"
                  variant="primary"
                  label={t.achievements.sync}
                  unavailable={running}
                  autoFocus={games.length === 0}
                  onConfirm={sync}
                >
                  <img src={syncIcon} alt="" />
                  {running ? t.achievements.syncing : t.achievements.sync}
                </Button>
              </>
            )}
          </div>
          {overview.status === 'ready' && (
            <section className="achievements__summary">
              <div>
                <p className="achievements__summary-label">{t.achievements.total}</p>
                <p className="achievements__summary-value">{overview.data.total}</p>
              </div>
              <TrophyRow totals={overview.data.trophies} />
            </section>
          )}
          <div className="achievements__scroll">{content}</div>
        </main>
        <Footer hints={HINTS} />
      </div>
    </FocusScope>
  )
}

function statusText(status: AchievementSyncStatus | null): string {
  if (status === null) return ''
  if (status.running) return t.achievements.progress(status.done, status.total)
  if (status.lastRun === null) return ''
  if (status.failures.length === 0) return t.achievements.syncDone
  if (status.failures.every((f) => f.reason === 'not-configured')) {
    return t.achievements.syncNeedsConfig
  }
  return t.achievements.syncPartial(status.failures.length, status.total)
}

function GameRow({
  game,
  autoFocus
}: {
  game: AchievementGameSummary
  autoFocus: boolean
}): React.JSX.Element {
  const navigation = useNavigation()
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(
    `achievements:game:${game.id}`,
    { autoFocus, onConfirm: () => navigation.openGameAchievements(game.id) }
  )
  return (
    <button
      ref={setElement}
      className="achievement-game"
      data-focused={focused}
      data-hidden={game.hidden}
      aria-label={game.title}
      tabIndex={-1}
      {...mouse}
    >
      <Artwork
        gameId={game.id}
        kind="header"
        available={game.artwork}
        title={game.title}
        className="achievement-game__art"
      />
      <span className="achievement-game__info">
        <span className="achievement-game__title">{game.title}</span>
        <span className="achievement-game__origin">
          <img src={steamIcon} alt="" />
          {game.originName}
          {game.hidden && <span className="achievement-game__hidden">{t.library.hiddenBadge}</span>}
        </span>
      </span>
      <span className="achievement-game__percent">{Math.floor(game.percent)}%</span>
      <ProgressBar percent={game.percent} />
      <span className="achievement-game__count">
        <img src={trophyIcon} alt="" />
        <span>
          <strong>{game.unlocked}</strong> / {game.total}
        </span>
      </span>
      <img className="achievement-game__chevron" src={chevronIcon} alt="" />
    </button>
  )
}
