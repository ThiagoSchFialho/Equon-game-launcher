import { useEffect, useRef, useState } from 'react'
import type { GameDetails } from '../../../shared/ipc/contract'
import backIcon from '../assets/icons/game-page-back.svg'
import calendarIcon from '../assets/icons/game-page-calendar.svg'
import clockIcon from '../assets/icons/game-page-clock.svg'
import moreIcon from '../assets/icons/game-page-more.svg'
import playIcon from '../assets/icons/game-page-play.svg'
import trophyIcon from '../assets/icons/game-page-trophy.svg'
import rating10 from '../assets/ratings/10.png'
import rating12 from '../assets/ratings/12.png'
import rating14 from '../assets/ratings/14.png'
import rating16 from '../assets/ratings/16.png'
import rating18 from '../assets/ratings/18.png'
import ratingL from '../assets/ratings/l.png'
import ratingPending from '../assets/ratings/pendente.png'
import { useNavigation, type Section } from '../app/navigation'
import { Artwork } from '../components/Artwork'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/Dialog'
import { Footer, type Hint } from '../components/Footer'
import { OptionsMenu } from '../components/OptionsMenu'
import { StateMessage } from '../components/StateMessage'
import {
  ageRatingKey,
  formatLastPlayed,
  formatPlaytime,
  releaseYear,
  type AgeRatingKey
} from '../data/format'
import { useGameDetails, useGames } from '../data/games'
import { useRunning } from '../data/running'
import { useFocusable, useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import './GameDetailsScreen.css'

const RATING_IMAGES: Record<AgeRatingKey, string> = {
  l: ratingL,
  '10': rating10,
  '12': rating12,
  '14': rating14,
  '16': rating16,
  '18': rating18,
  pendente: ratingPending
}

const HINTS: Hint[] = [
  { button: 'A', label: t.hints.open },
  { button: 'B', label: t.hints.back }
]
const MENU_HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

/** How often a game Steam is busy with is re-read. */
const STEAM_BUSY_POLL_MS = 5000

function BackLink({ from }: { from: Section }): React.JSX.Element {
  const navigation = useNavigation()
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>('game:back', {
    onConfirm: navigation.back
  })
  return (
    <button ref={setElement} className="game__back" data-focused={focused} tabIndex={-1} {...mouse}>
      <img src={backIcon} alt="" />
      <span>{t.nav[from]}</span>
    </button>
  )
}

function Stat({
  icon,
  label,
  value
}: {
  icon: string
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="game__stat">
      <img src={icon} alt="" />
      <div>
        <p className="game__stat-label">{label}</p>
        <p className="game__stat-value">{value}</p>
      </div>
    </div>
  )
}

/** Why Play is unavailable, or what is happening (DATA_BASE_CONTEXT.md §3.2). */
function playNote(
  game: GameDetails,
  running: boolean,
  launching: boolean,
  launchError: string | null
): string | null {
  const steam = game.origin === 'steam'
  if (launchError) return launchError
  if (running) return t.game.runningNote
  if (launching && steam) return t.game.steamLaunching
  switch (game.launchIssue) {
    case null:
      return game.tracksTime ? null : t.game.untracked
    case 'steam-busy':
      return t.game.steamBusy
    case 'install-unknown':
      return steam ? t.game.steamUnknown : t.game.installUnknown
    case 'not-installed':
      return steam ? t.game.steamNotInstalled : t.game.notInstalled
    case 'emulator-missing':
      return t.game.emulatorMissing
    case 'no-config':
      return t.game.noConfig
  }
}

function Details({
  game,
  from,
  running,
  onOpenMenu
}: {
  game: GameDetails
  from: Section
  running: boolean
  onOpenMenu: () => void
}): React.JSX.Element {
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const onPlay = (): void => {
    setLaunching(true)
    setLaunchError(null)
    void window.equon.games.launch(game.id).then((result) => {
      setLaunching(false)
      if (!result.ok) {
        setLaunchError(t.launchErrors[result.error.code] ?? t.launchErrors['start-failed'])
      }
    })
  }
  const note = playNote(game, running, launching, launchError)
  const year = releaseYear(game.releaseDate)
  const rating = ageRatingKey(game.requiredAge)
  const byline = [year, game.developer].filter(Boolean).join(' • ')
  return (
    <div className="game">
      <aside className="game__info">
        <BackLink from={from} />
        <Artwork
          gameId={game.id}
          kind="logo"
          available={game.artwork}
          title={game.title}
          className="game__logo"
          loading="eager"
        />
        {game.genres.length > 0 && <p className="game__genres">{game.genres.join('  •  ')}</p>}
        {byline && <p className="game__byline">{byline}</p>}
        {game.description && (
          <section className="game__about">
            <h2>{t.game.about}</h2>
            <p>{game.description}</p>
          </section>
        )}
      </aside>

      <Artwork
        gameId={game.id}
        kind="background"
        available={game.artwork}
        title={game.title}
        className="game__hero"
        loading="eager"
      />

      <div className="game__bar">
        <div className="game__actions">
          <Button
            id="game:play"
            variant="primary"
            label={running ? t.game.running : t.game.play}
            unavailable={!game.launchable || running || launching}
            autoFocus
            onConfirm={onPlay}
          >
            <img src={playIcon} alt="" />
            {running ? t.game.running : t.game.play}
          </Button>
          <Button id="game:more" variant="icon" label={t.game.more} onConfirm={onOpenMenu}>
            <img src={moreIcon} alt="" />
          </Button>
          {note && (
            <p
              className="game__play-note"
              data-tone={launchError ? 'error' : undefined}
              role={launchError ? 'alert' : undefined}
            >
              {note}
            </p>
          )}
        </div>
        <div className="game__stats">
          <Stat
            icon={clockIcon}
            label={t.game.playtime}
            value={game.playtime > 0 ? formatPlaytime(game.playtime) : t.game.neverPlayed}
          />
          <Stat
            icon={calendarIcon}
            label={t.game.lastSession}
            value={game.timeLastPlayed ? formatLastPlayed(game.timeLastPlayed) : '—'}
          />
          {game.achievements && (
            <Stat
              icon={trophyIcon}
              label={t.game.achievements}
              value={`${game.achievements.unlocked} / ${game.achievements.total}`}
            />
          )}
        </div>
        <img
          className="game__rating"
          src={RATING_IMAGES[rating]}
          alt={
            rating === 'pendente' ? t.game.ageRatingPending : t.game.ageRating(rating.toUpperCase())
          }
        />
      </div>
    </div>
  )
}

export function GameDetailsScreen({ id, from }: { id: number; from: Section }): React.JSX.Element {
  const navigation = useNavigation()
  const { reload: reloadGames, refresh: refreshGames } = useGames()
  const { details, reload, refresh } = useGameDetails(id)
  const [overlay, setOverlay] = useState<'menu' | 'remove' | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const running = useRunning().ids.includes(id)
  // While Steam installs or updates the game, re-read it so Play comes back when it is done.
  const steamBusy = details.status === 'ready' && details.data?.launchIssue === 'steam-busy'
  useEffect(() => {
    if (!steamBusy) return
    const timer = setInterval(refresh, STEAM_BUSY_POLL_MS)
    return () => clearInterval(timer)
  }, [steamBusy, refresh])

  // When this game stops, playtime and last session change.
  const wasRunning = useRef(running)
  useEffect(() => {
    if (wasRunning.current && !running) refresh()
    wasRunning.current = running
  }, [running, refresh])

  useScreenActions({ back: navigation.back, menu: () => setOverlay('menu') })

  const remove = (): void => {
    void window.equon.games.remove(id).then((result) => {
      if (!result.ok) {
        setRemoveError(t.remove.failed)
        setOverlay(null)
        return
      }
      reloadGames()
      navigation.back()
    })
  }

  let content: React.JSX.Element
  if (details.status === 'loading') {
    content = <StateMessage message={t.game.loading} />
  } else if (details.status === 'error') {
    content = (
      <StateMessage
        tone="error"
        message={t.game.error}
        action={{ id: 'game:retry', label: t.library.retry, onConfirm: reload }}
      />
    )
  } else if (details.data === null) {
    content = (
      <StateMessage
        message={t.game.notFound}
        action={{ id: 'game:not-found-back', label: t.hints.back, onConfirm: navigation.back }}
      />
    )
  } else {
    content = (
      <Details
        game={details.data}
        from={from}
        running={running}
        onOpenMenu={() => setOverlay('menu')}
      />
    )
  }

  return (
    <FocusScope id={`screen:game:${id}`}>
      <div className="screen">
        <main className="screen__main">{content}</main>
        {removeError && (
          <p className="game__remove-error" role="alert">
            {removeError}
          </p>
        )}
        <Footer hints={overlay ? MENU_HINTS : HINTS} />
      </div>
      {overlay === 'menu' && details.status === 'ready' && details.data && (
        <OptionsMenu
          title={details.data.title}
          beated={details.data.beated}
          hidden={details.data.hidden}
          onFlags={(flags) => {
            void window.equon.games.setFlags(id, flags).finally(() => {
              refresh()
              refreshGames()
              setOverlay(null)
            })
          }}
          onClose={() => setOverlay(null)}
          onEdit={details.data.editable ? () => navigation.openGameForm(id) : undefined}
          onRemove={details.data.editable && !running ? () => setOverlay('remove') : undefined}
        />
      )}
      {overlay === 'remove' && details.status === 'ready' && details.data && (
        <ConfirmDialog
          title={t.remove.title(details.data.title)}
          message={t.remove.message}
          confirmLabel={t.remove.confirm}
          cancelLabel={t.remove.cancel}
          destructive
          onCancel={() => setOverlay(null)}
          onConfirm={remove}
        />
      )}
    </FocusScope>
  )
}
