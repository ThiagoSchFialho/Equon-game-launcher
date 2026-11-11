import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameSummary } from '../../../../shared/ipc/contract'
import { HomeArtBackdrop } from '../../components/HomeArtBackdrop'
import { homeArtUrl, useHomeArt } from '../../data/home-art'
import { useFocusManager } from '../../focus/focus-context'
import { prefersReducedMotion } from '../../focus/focus-manager'

export const HOME_SCOPE = 'screen:home'
/** Each half of the name's fade: half of --motion-focus (CenteredCovers.css, CoverShelf.css). */
const INFO_FADE_MS = 70
/**
 * The background art (D-25) changes once the focus stops: a held direction would otherwise
 * swap a large blurred image every 110 ms.
 */
const ART_SETTLE_MS = 150

export interface CoverFocus {
  /** The focused card: the layout moves to it at once. */
  index: number
  /** The card the name block shows, which follows `index` once the name has faded out. */
  infoIndex: number
  infoHidden: boolean
  /** Call from each card's onFocus. */
  focusCard(index: number): void
  /** The background art of the focused game (D-25), portalled onto the whole Home screen. */
  backdrop: React.ReactNode
}

/**
 * What both Home layouts share (D-27, "Centro" and "Embaixo"): which card is focused, the name
 * that fades out, moves while hidden and fades in for the new card, and the background art.
 * `variant` is the card kind the layout shows, which is part of the focus id: coming back to
 * Home starts on the restored game, so the row does not travel to it on screen.
 */
export function useCoverFocus(
  games: GameSummary[],
  variant: 'portrait' | 'square',
  backdropTarget: HTMLElement | null
): CoverFocus {
  const homeArt = useHomeArt().settings
  const manager = useFocusManager()
  const [index, setIndex] = useState(() => {
    const restored = manager.rememberedFocus(HOME_SCOPE)
    return Math.max(
      games.findIndex((game) => `game-card:${variant}:${game.id}` === restored),
      0
    )
  })
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

  return {
    index,
    infoIndex: Math.min(infoIndex, games.length - 1),
    infoHidden,
    focusCard,
    backdrop
  }
}
