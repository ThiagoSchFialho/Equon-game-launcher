import { useEffect, useState } from 'react'
import { achievementIconUrl, type AchievementItem } from '../../../shared/ipc/contract'
import clockIcon from '../assets/icons/game-page-clock.svg'
import { useNavigation } from '../app/navigation'
import { Footer, type Hint } from '../components/Footer'
import { StateMessage } from '../components/StateMessage'
import { TROPHY_IMAGES } from '../components/trophy-images'
import { ProgressBar, TrophyRow } from '../components/Trophies'
import { useGameAchievements } from '../data/achievements'
import { formatUnlockDate } from '../data/format'
import { useFocusable, useFocusManager, useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import './GameAchievementsScreen.css'

const HINTS: Hint[] = [{ button: 'B', label: t.hints.back }]

/** One game's achievements (mockups "Achievements game" and "with platine"). */
export function GameAchievementsScreen({ id }: { id: number }): React.JSX.Element {
  const navigation = useNavigation()
  const [attempt, setAttempt] = useState(0)
  const data = useGameAchievements(id, attempt)
  useScreenActions({ back: () => navigation.back() })

  // Icons are only downloaded for the game being looked at (owner decision, Phase 7).
  const ready = data.status === 'ready' && data.data?.status === 'ready'
  useEffect(() => {
    if (ready) void window.equon.achievements.ensureIcons(id)
  }, [ready, id])

  let content: React.JSX.Element
  if (data.status === 'loading') {
    content = <StateMessage message={t.achievements.loading} />
  } else if (data.status === 'error') {
    content = (
      <StateMessage
        tone="error"
        message={t.achievements.error}
        action={{
          id: 'game-achievements:retry',
          label: t.library.retry,
          onConfirm: () => setAttempt((n) => n + 1)
        }}
      />
    )
  } else if (data.data === null) {
    content = <StateMessage tone="error" message={t.game.notFound} />
  } else if (data.data.status !== 'ready') {
    content = (
      <>
        <h1 className="game-achievements__title">{data.data.title}</h1>
        <StateMessage
          message={
            data.data.status === 'none' ? t.achievements.noneForGame : t.achievements.notSyncedGame
          }
          hint={data.data.stale ? t.achievements.syncFailed : undefined}
        />
      </>
    )
  } else {
    const game = data.data
    content = (
      <>
        <h1 className="game-achievements__title">{game.title}</h1>
        {game.stale && (
          <p className="game-achievements__stale" role="status">
            {t.achievements.stale}
          </p>
        )}
        <section className="game-achievements__summary">
          <p className="game-achievements__count">
            {game.unlockedCount} <span>/ {game.total}</span>
          </p>
          <ProgressBar percent={game.percent ?? 0} />
          <p className="game-achievements__percent">{Math.floor(game.percent ?? 0)}%</p>
          <TrophyRow totals={game.trophies} />
        </section>
        <div className="game-achievements__columns">
          <AchievementColumn
            heading={t.achievements.unlocked}
            items={game.unlocked}
            tone="unlocked"
            emptyMessage={t.achievements.noneUnlocked}
            autoFocus
          />
          {game.platinum ? (
            <div className="game-achievements__platinum">
              <img src={TROPHY_IMAGES.platine} alt="" />
              <p>{t.achievements.platinum}</p>
            </div>
          ) : (
            <AchievementColumn
              heading={t.achievements.locked}
              items={game.locked}
              tone="locked"
              emptyMessage=""
              autoFocus={game.unlocked.length === 0}
            />
          )}
        </div>
      </>
    )
  }

  return (
    <FocusScope id={`screen:game-achievements:${id}`}>
      <div className="screen">
        <main className="screen__main game-achievements">{content}</main>
        <Footer hints={HINTS} showActivity />
      </div>
    </FocusScope>
  )
}

function AchievementColumn({
  heading,
  items,
  tone,
  emptyMessage,
  autoFocus
}: {
  heading: string
  items: AchievementItem[]
  tone: 'unlocked' | 'locked'
  emptyMessage: string
  autoFocus: boolean
}): React.JSX.Element {
  return (
    <section className="game-achievements__column">
      <h2 data-tone={tone}>{heading}</h2>
      <div className="game-achievements__list">
        {items.length === 0 && <p className="game-achievements__empty">{emptyMessage}</p>}
        {items.map((item, index) => (
          <AchievementRow
            key={item.id}
            item={item}
            locked={tone === 'locked'}
            autoFocus={autoFocus && index === 0}
            previousId={items[index - 1]?.id ?? null}
            nextId={items[index + 1]?.id ?? null}
          />
        ))}
      </div>
    </section>
  )
}

/** Read-only, but focusable: this is how the controller scrolls through the list. */
function AchievementRow({
  item,
  locked,
  autoFocus,
  previousId,
  nextId
}: {
  item: AchievementItem
  locked: boolean
  autoFocus: boolean
  previousId: number | null
  nextId: number | null
}): React.JSX.Element {
  const manager = useFocusManager()
  const { setElement, focused } = useFocusable<HTMLDivElement>(`achievement:${item.id}`, {
    autoFocus,
    // Up and down follow this column; only left and right cross to the other one.
    onDirection: (direction) => {
      if (direction !== 'up' && direction !== 'down') return false
      const target = direction === 'up' ? previousId : nextId
      if (target !== null) manager.focus(`achievement:${target}`)
      return true
    }
  })
  return (
    <div
      ref={setElement}
      className="achievement"
      data-focused={focused}
      data-locked={locked}
      aria-label={item.name}
    >
      {item.iconCached ? (
        <img className="achievement__icon" src={achievementIconUrl(item.id, locked)} alt="" />
      ) : (
        <span className="achievement__icon achievement__icon--empty" aria-hidden />
      )}
      <div className="achievement__text">
        <p className="achievement__name">{item.name}</p>
        <p className="achievement__description">{item.description ?? t.achievements.hiddenText}</p>
      </div>
      <div className="achievement__meta">
        <p className="achievement__date">
          <img src={clockIcon} alt="" />
          {item.unlockedAt ? formatUnlockDate(item.unlockedAt) : t.achievements.noDate}
        </p>
        <p className="achievement__tier" data-tier={item.tier}>
          <img src={TROPHY_IMAGES[item.tier]} alt={t.achievements.tiers[item.tier]} />
          {item.globalPercent === null ? '—' : `${item.globalPercent.toFixed(1)}%`}
        </p>
      </div>
    </div>
  )
}
