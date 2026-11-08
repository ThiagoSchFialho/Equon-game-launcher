import type { UiSoundsState } from './sound-context'
import { audioVoice, createUiSoundPlayer, type UiSound, type Voice } from './ui-sounds'

export interface AppSounds extends UiSoundsState {
  setGameRunning(running: boolean): void
  setLaunchCover(up: boolean): void
}

/**
 * The app's interface sounds (owner decision), created once. Silent until Settings says they
 * are on, while a game runs, under the launch image and with the window in the background.
 */
export function createAppSounds(
  deps: {
    voice?: (sound: UiSound) => Voice
    now?: () => number
    hasFocus?: () => boolean
  } = {}
): AppSounds {
  let enabled = false
  let gameRunning = false
  let launchCover = false
  const hasFocus = deps.hasFocus ?? (() => document.hasFocus())
  const player = createUiSoundPlayer({
    voice: deps.voice ?? audioVoice,
    now: deps.now ?? (() => performance.now()),
    canPlay: () => enabled && !gameRunning && !launchCover && hasFocus()
  })
  return {
    play: (sound) => player.play(sound),
    setEnabled: (on) => {
      enabled = on
    },
    setGameRunning: (running) => {
      gameRunning = running
    },
    setLaunchCover: (up) => {
      launchCover = up
    }
  }
}
