import { createContext, useContext } from 'react'
import { artworkUrl, type GameSummary, type HomeArtSettings } from '../../../shared/ipc/contract'

/**
 * The art the Home background shows for a game (D-30): its Home image, else its launch image,
 * else its background.
 */
export function homeArtUrl(game: GameSummary): string | null {
  const kind = (['home', 'launch', 'background'] as const).find((k) => game.artwork.includes(k))
  return kind ? artworkUrl(game.id, kind, game.artworkVersion) : null
}

/** Off until Settings answers, like the column's default. */
export const DEFAULT_HOME_ART: HomeArtSettings = { enabled: false, blur: 4, dim: 60 }

export interface HomeArtState {
  settings: HomeArtSettings
  /** Configurações › Aparência saved a change: the Home screen follows at once. */
  set(settings: HomeArtSettings): void
}

export const HomeArtContext = createContext<HomeArtState>({
  settings: DEFAULT_HOME_ART,
  set: () => {}
})

export const useHomeArt = (): HomeArtState => useContext(HomeArtContext)
