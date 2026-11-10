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
    '--card-width': `${7 + covers.size * 0.25}rem`,
    '--card-gap': `${covers.gap / 10}rem`
  }
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
