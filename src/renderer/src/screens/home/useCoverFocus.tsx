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
/** The art layer of the item at index -1; game ids are always positive. */
const LEADING_ART = -1

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
  backdropTarget: HTMLElement | null,
  /** The background art of the item at index -1 (D-32: the Settings shortcut), if any. */
  leadingArt: string | null = null
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

  const byId = new Map(games.map((game) => [game.id, game]))
  // A layer is a game id, or LEADING_ART for the item at index -1; both resolve to a URL.
  const artUrl = (id: number): string | null | undefined => {
    if (id === LEADING_ART) return leadingArt
    const game = byId.get(id)
    return game ? homeArtUrl(game) : undefined
  }
  const artIdAt = (i: number): number | undefined =>
    i === -1 ? (leadingArt ? LEADING_ART : undefined) : games[i]?.id

  const showArt = (id: number | undefined): void => {
    if (id === undefined) return
    setArtLayers((layers) => {
      if (layers.at(-1) === id) return layers
      // No fade without motion, or onto an item with no art: straight to the new one.
      if (prefersReducedMotion() || !artUrl(id)) return [id]
      return [...layers.slice(-1), id]
    })
  }

  const focusCard = (i: number): void => {
    setIndex(i)
    // The first focus (the screen opening or coming back) shows its art at once, without a fade.
    const opening = artIdAt(i)
    if (opening !== undefined) setArtLayers((layers) => (layers.length === 0 ? [opening] : layers))
    if (artTimer.current) clearTimeout(artTimer.current)
    artTimer.current = setTimeout(() => {
      artTimer.current = null
      showArt(artIdAt(i))
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

  const backdrop =
    homeArt.enabled && backdropTarget
      ? createPortal(
          <HomeArtBackdrop
            layers={artLayers.flatMap((id) => {
              const url = artUrl(id)
              return url === undefined ? [] : [{ gameId: id, url }]
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
