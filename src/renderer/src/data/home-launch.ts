import { createContext, useContext } from 'react'

/**
 * Settings › Sistema › "Ignorar tela do jogo na home" (D-28): on the Home screen, A starts the
 * game instead of opening its page. Off until Settings answers, like the column's default.
 */
export interface HomeLaunchState {
  directLaunch: boolean
  /** Settings saved a change: the Home screen follows at once. */
  set(directLaunch: boolean): void
}

export const HomeLaunchContext = createContext<HomeLaunchState>({
  directLaunch: false,
  set: () => {}
})

export const useHomeLaunch = (): HomeLaunchState => useContext(HomeLaunchContext)
