import { createContext, useContext } from 'react'
import type { UiSound } from './ui-sounds'

export interface UiSoundsState {
  play(sound: UiSound): void
  /** Settings › Sistema changed "Sons da interface". */
  setEnabled(enabled: boolean): void
}

/** Silent outside the app (and in tests that render a component alone). */
export const UiSoundsContext = createContext<UiSoundsState>({
  play: () => {},
  setEnabled: () => {}
})

export const useUiSounds = (): UiSoundsState => useContext(UiSoundsContext)
