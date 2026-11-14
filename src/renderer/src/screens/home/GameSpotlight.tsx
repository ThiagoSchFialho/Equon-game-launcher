import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  achievementIconUrl,
  artworkUrl,
  type AchievementItem,
  type GameAchievements,
  type GameSummary
} from '../../../../shared/ipc/contract'
import homeClockIcon from '../../assets/icons/home-clock.svg'
import trophyIcon from '../../assets/icons/trophy.svg'
import { TROPHY_IMAGES } from '../../components/trophy-images'
import { formatPlaytime, formatUnlockDate } from '../../data/format'
import { useFocusable, useFocusManager, useScreenActions } from '../../focus/focus-context'
import type { Direction } from '../../input/actions'
import { t } from '../../strings'
import './GameSpotlight.css'

/** How many unlocked achievements the panel shows (owner decision). */
const RECENT_COUNT = 4
/** Like the background art (D-25): the panel asks main only once the focus stops. */
const SETTLE_MS = 150

export const SPOTLIGHT_PREFIX = 'spotlight:'
const tileId = (index: number): string => `${SPOTLIGHT_PREFIX}tile:${index}`
const ALL_ID = `${SPOTLIGHT_PREFIX}all`

type Loaded =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: GameAchievements | null }

/**
 * The focused game's achievements, from the local database (no network): asked once the focus
 * settles on a game, and again when main reports a change (a sync, icons downloaded).
 */
function useSpotlightAchievements(gameId: number | null): Loaded {
  const [loaded, setLoaded] = useState<{ gameId: number | null; value: Loaded }>({
    gameId: null,
    value: { status: 'loading' }
  })
  useEffect(() => {
    if (gameId === null) return
    let cancelled = false
    const fetchNow = (): void => {
      window.equon.achievements.game(gameId).then(
        (data) => !cancelled && setLoaded({ gameId, value: { status: 'ready', data } }),
        () => !cancelled && setLoaded({ gameId, value: { status: 'error' } })
      )
    }
    const timer = setTimeout(fetchNow, SETTLE_MS)
    const unsubscribe = window.equon.achievements.onChanged(fetchNow)
    return () => {
      cancelled = true
      clearTimeout(timer)
      unsubscribe()
    }
  }, [gameId])
  // An answer for another game is not shown: it is still loading for this one.
  return loaded.gameId === gameId ? loaded.value : { status: 'loading' }
}

/**
 * "Em cima"'s panel under the shelf (owner decision, D-29): the focused game's logo, its play
 * stats and its latest achievements. Down on the focused cover enters the row of achievements,
 * left and right walk it, up (or B) goes back to that cover, and A opens the game's
 * achievements page. The focused one is described under the row.
 */
export function GameSpotlight({
  game,
  hidden,
  cardId,
  onOpenAchievements,
  onShown
}: {
  game: GameSummary | undefined
  /** While the name fades out and in for another game, so does the panel. */
  hidden: boolean
  /** The focused cover, where up goes back to. */
  cardId: string | null
  onOpenAchievements: (game: GameSummary) => void
  /** The game the panel shows, for the Home's X (owner decision). */
  onShown?: (game: GameSummary | null) => void
}): React.JSX.Element | null {
  const manager = useFocusManager()
  const achievements = useSpotlightAchievements(game?.id ?? null)
  const focusedId = useSyncExternalStore(manager.subscribe, () => manager.focusedId)
  // Icons are downloaded once the user comes down to the panel (owner decision, D-29).
  const iconsAsked = useRef(new Set<number>())
  const inPanel = focusedId?.startsWith(SPOTLIGHT_PREFIX) ?? false
  // B only does something inside the panel: back to the cover of the game it shows.
  useScreenActions({ back: inPanel && cardId ? () => manager.focus(cardId) : undefined })
  useEffect(() => {
    onShown?.(game ?? null)
    return () => onShown?.(null)
  }, [game, onShown])
  useEffect(() => {
    if (!inPanel || !game || iconsAsked.current.has(game.id)) return
    iconsAsked.current.add(game.id)
    void window.equon.achievements.ensureIcons(game.id).catch(() => {})
  }, [inPanel, game])

  if (!game) return null
  const data = achievements.status === 'ready' ? achievements.data : null
  const ready = data?.status === 'ready'
  const recent = ready ? recentUnlocked(data.unlocked) : []
  const focusedTile = recent.findIndex((_, i) => focusedId === tileId(i))

  const open = (): void => {
    // Back from the achievements page, Home comes back to this game's cover.
    if (cardId) manager.focus(cardId)
    onOpenAchievements(game)
  }
  const step = (index: number, direction: Direction): boolean => {
    if (direction === 'up') {
      if (cardId) manager.focus(cardId)
      return true
    }
    if (direction === 'left') {
      if (index > 0) manager.focus(tileId(index - 1))
      return true
    }
    if (direction === 'right') {
      manager.focus(index + 1 < recent.length ? tileId(index + 1) : ALL_ID)
      return true
    }
    return false
  }

  return (
    <section className="home-spotlight" data-hidden={hidden} aria-label={game.title}>
      {game.artwork.includes('logo') && (
        <div key={game.id} className="home-spotlight__logo">
          <img
            src={artworkUrl(game.id, 'logo', game.artworkVersion)}
            alt=""
            // A file that fails to load shows nothing rather than a broken image.
            onError={(event) => (event.currentTarget.style.visibility = 'hidden')}
          />
        </div>
      )}
      {/* Bottom left, by the footer (owner's sketch): the latest achievements. */}
      {/* Only with achievements unlocked: otherwise the whole block is left out (owner decision),
          also while loading or after an error, so it does not flash in and out. */}
      {recent.length > 0 && data && (
        <div className="home-spotlight__achievements">
          <p className="home-spotlight__detail" aria-live="polite">
            {focusedTile >= 0
              ? describe(recent[focusedTile])
              : focusedId === ALL_ID
                ? t.home.spotlight.allHint
                : ''}
          </p>
          {/* Only the heading: the progress count was dropped (owner decision). */}
          <h2 className="home-spotlight__title">{t.home.spotlight.recent}</h2>
          <AchievementsRow
            recent={recent}
            step={step}
            backToCard={() => cardId && manager.focus(cardId)}
            onOpen={open}
          />
        </div>
      )}

      {/* Bottom right: only the playtime, on a dark see-through chip (owner decision). */}
      <p className="home-spotlight__playtime">
        <img src={homeClockIcon} alt="" />
        {game.playtime > 0 ? formatPlaytime(game.playtime) : t.game.neverPlayed}
      </p>
    </section>
  )
}

/** The latest achievements, then "Ver todas". */
function AchievementsRow({
  recent,
  step,
  backToCard,
  onOpen
}: {
  recent: AchievementItem[]
  step: (index: number, direction: Direction) => boolean
  backToCard: () => void
  onOpen: () => void
}): React.JSX.Element {
  return (
    <div className="home-spotlight__row">
      {recent.map((item, i) => (
        <AchievementTile
          key={item.id}
          id={tileId(i)}
          item={item}
          onDirection={(direction) => step(i, direction)}
          onConfirm={onOpen}
        />
      ))}
      <AllTile
        onDirection={(direction) => {
          if (direction === 'up') {
            backToCard()
            return true
          }
          if (direction === 'left') return step(recent.length, 'left')
          return direction === 'right'
        }}
        onConfirm={onOpen}
      />
    </div>
  )
}

function AchievementTile({
  id,
  item,
  onDirection,
  onConfirm
}: {
  id: string
  item: AchievementItem
  onDirection: (direction: Direction) => boolean
  onConfirm: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    onConfirm,
    onDirection,
    scroll: 'none'
  })
  return (
    <button
      ref={setElement}
      className="home-spotlight__tile"
      data-focused={focused}
      aria-label={item.name}
      tabIndex={-1}
      {...mouse}
    >
      {item.iconCached ? (
        <img className="home-spotlight__icon" src={achievementIconUrl(item.id, false)} alt="" />
      ) : (
        <span className="home-spotlight__icon home-spotlight__icon--empty" aria-hidden />
      )}
      <span className="home-spotlight__tile-name">{item.name}</span>
    </button>
  )
}

function AllTile({
  onDirection,
  onConfirm
}: {
  onDirection: (direction: Direction) => boolean
  onConfirm: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(ALL_ID, {
    onConfirm,
    onDirection,
    scroll: 'none'
  })
  return (
    <button
      ref={setElement}
      className="home-spotlight__tile home-spotlight__tile--all"
      data-focused={focused}
      aria-label={t.home.spotlight.all}
      tabIndex={-1}
      {...mouse}
    >
      <img className="home-spotlight__icon" src={trophyIcon} alt="" />
      <span className="home-spotlight__tile-name">{t.home.spotlight.all}</span>
    </button>
  )
}

/** The latest unlocked ones; the list comes from main newest first (DATA_BASE_CONTEXT.md). */
function recentUnlocked(unlocked: readonly AchievementItem[]): AchievementItem[] {
  return unlocked.slice(0, RECENT_COUNT)
}

/** The focused achievement under the row: description, tier, rarity and when. */
function describe(item: AchievementItem): React.ReactNode {
  return (
    <>
      <img src={TROPHY_IMAGES[item.tier]} alt={t.achievements.tiers[item.tier]} />
      <span className="home-spotlight__detail-name">{item.name}</span>
      {item.description ?? t.achievements.hiddenText}
      {item.globalPercent !== null && ` · ${item.globalPercent.toFixed(1)}%`}
      {item.unlockedAt && ` · ${formatUnlockDate(item.unlockedAt)}`}
    </>
  )
}
