import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameSummary } from '../../../../shared/ipc/contract'
import { HomeArtBackdrop } from '../../components/HomeArtBackdrop'
import { homeArtUrl, shownHomeArt, useHomeArt } from '../../data/home-art'
import { useHomeCovers } from '../../data/home-covers'
import { useFocusManager } from '../../focus/focus-context'
import { prefersReducedMotion } from '../../focus/focus-manager'

export const HOME_SCOPE = 'screen:home'

/**
 * The focus id of a Home cover, in every layout. Its own: the Library's square cards are
 * `game-card:square:<id>`, and the same id on both screens kept a Home focus in the Library.
 */
export const homeCardId = (game: GameSummary): string => `home-card:${game.id}`
/** Each half of the name's fade: half of --motion-focus (CenteredCovers.css, CoverShelf.css). */
const INFO_FADE_MS = 70
/**
 * The background art (D-25) changes once the focus stops: a held direction would otherwise
 * swap a large blurred image every 110 ms.
 */
const ART_SETTLE_MS = 150
/** The art layer of the item at index -1; game ids are always positive. */
const LEADING_ART = -1

/** An item of the row by its game id (LEADING_ART for index -1), and where it was then. */
interface Item {
  key: number
  at: number
}

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
 * Coming back to Home starts on the restored game (homeCardId), so the row does not travel to
 * it on screen.
 */
export function useCoverFocus(
  games: GameSummary[],
  backdropTarget: HTMLElement | null,
  /** The background art of the item at index -1 (D-32: the Settings shortcut), if any. */
  leadingArt: string | null = null
): CoverFocus {
  const homeArt = shownHomeArt(useHomeArt().settings, useHomeCovers().settings.position)
  const manager = useFocusManager()
  // The focused item and the one the name shows are kept as game ids (LEADING_ART for index -1),
  // not positions: when a game closes it moves to the front of the Home, and the focus, which
  // stays on its card, must take the layout with it.
  const [focused, setFocused] = useState<Item>(() => {
    const restored = manager.rememberedFocus(HOME_SCOPE)
    const at = Math.max(
      games.findIndex((game) => homeCardId(game) === restored),
      0
    )
    return { key: games[at]?.id ?? LEADING_ART, at }
  })
  const [info, setInfo] = useState<Item>(focused)
  const indexOf = (item: Item): number => {
    if (item.key === LEADING_ART) return -1
    const found = games.findIndex((game) => game.id === item.key)
    // A game that has just left the list: where it was.
    return found !== -1 ? found : Math.max(0, Math.min(item.at, games.length - 1))
  }
  const index = indexOf(focused)
  const infoIndex = indexOf(info)
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

  const itemAt = (i: number): Item => ({
    key: i === -1 ? LEADING_ART : (games[i]?.id ?? LEADING_ART),
    at: i
  })

  const focusCard = (i: number): void => {
    setFocused(itemAt(i))
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
        setInfo(itemAt(i))
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
    infoIndex,
    infoHidden,
    focusCard,
    backdrop
  }
}
