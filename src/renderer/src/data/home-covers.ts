import { createContext, useContext } from 'react'
import type { HomeCoverSettings } from '../../../shared/ipc/contract'

/** The columns' defaults: the Home layout before "Capas da home" existed (D-27). */
export const DEFAULT_HOME_COVERS: HomeCoverSettings = { size: 74, gap: 35, position: 'center' }

/**
 * The levels as lengths (owner-approved mapping): the cover is 7rem + size × 0.25rem wide, so
 * 100 is 32rem, the largest size that still looks right (owner decision), and 74 gives the
 * original 25.5rem; the space between covers is gap × 0.1rem (35 gives the original 3.5rem).
 * rem follows the window size, so the layout scales with the screen.
 */
export function homeCoverStyle(covers: HomeCoverSettings): Record<string, string> {
  return {
    '--card-width': `${coverWidthRem(covers)}rem`,
    '--card-gap': `${covers.gap / 10}rem`
  }
}

/** The cover width in rem for the "Tamanho" level. */
export function coverWidthRem(covers: HomeCoverSettings): number {
  return 7 + covers.size * 0.25
}

/**
 * On the Home shelf ("Embaixo"), how much smaller than the focused cover the others are, in rem
 * (owner decision): the height of the name (--font-size-shelf-title 1.5rem × line height 1.25,
 * screens/home/CoverShelf.css) plus 10px (0.625rem at 1920×1080; rem follows the window). The
 * name fits in that room, above them.
 */
export const SHELF_NAME_ROOM_REM = 1.5 * 1.25 + 0.625

/** The small covers' scale on the shelf: a transform needs a number, so it is worked out here. */
export function shelfSmallScale(widthRem: number): number {
  return Math.max(0, widthRem - SHELF_NAME_ROOM_REM) / widthRem
}

export interface HomeCoversState {
  settings: HomeCoverSettings
  /** Configurações › Aparência saved a change: the Home screen follows at once. */
  set(settings: HomeCoverSettings): void
}

export const HomeCoversContext = createContext<HomeCoversState>({
  settings: DEFAULT_HOME_COVERS,
  set: () => {}
})

export const useHomeCovers = (): HomeCoversState => useContext(HomeCoversContext)
