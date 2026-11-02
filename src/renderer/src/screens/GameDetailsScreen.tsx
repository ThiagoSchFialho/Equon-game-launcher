import { useState } from 'react'
import type { GameDetails } from '../../../shared/ipc/contract'
import backIcon from '../assets/icons/game-page-back.svg'
import calendarIcon from '../assets/icons/game-page-calendar.svg'
import clockIcon from '../assets/icons/game-page-clock.svg'
import moreIcon from '../assets/icons/game-page-more.svg'
import playIcon from '../assets/icons/game-page-play.svg'
import trophyIcon from '../assets/icons/trophy.svg'
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
import { useGameDetails } from '../data/games'
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

function Details({
  game,
  from,
  onOpenMenu
}: {
  game: GameDetails
  from: Section
  onOpenMenu: () => void
}): React.JSX.Element {
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
        kind={game.artwork.includes('background') ? 'background' : 'cover_square'}
        available={game.artwork}
        title={game.title}
        className="game__hero"
        loading="eager"
      />

      <div className="game__bar">
        <div className="game__actions">
          {/* Launching arrives in Phases 4 and 6; the button shows the unavailable state. */}
          <Button id="game:play" variant="primary" label={t.game.play} unavailable autoFocus>
            <img src={playIcon} alt="" />
            {t.game.play}
          </Button>
          <Button id="game:more" variant="icon" label={t.game.more} onConfirm={onOpenMenu}>
            <img src={moreIcon} alt="" />
          </Button>
          <p className="game__play-note">{t.game.playSoon}</p>
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
  const { details, reload } = useGameDetails(id)
  const [menuOpen, setMenuOpen] = useState(false)

  useScreenActions({ back: navigation.back, menu: () => setMenuOpen(true) })

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
    content = <Details game={details.data} from={from} onOpenMenu={() => setMenuOpen(true)} />
  }

  return (
    <FocusScope id={`screen:game:${id}`}>
      <div className="screen">
        <main className="screen__main">{content}</main>
        <Footer hints={menuOpen ? MENU_HINTS : HINTS} />
      </div>
      {menuOpen && details.status === 'ready' && details.data && (
        <OptionsMenu
          title={details.data.title}
          beated={details.data.beated}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </FocusScope>
  )
}
