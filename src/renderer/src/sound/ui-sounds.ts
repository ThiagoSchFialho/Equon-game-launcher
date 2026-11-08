import backUrl from '../assets/sounds/back.wav'
import confirmUrl from '../assets/sounds/confirm.wav'
import modalOpenUrl from '../assets/sounds/modal-open.wav'
import navigateUrl from '../assets/sounds/navigate.wav'
import playUrl from '../assets/sounds/play.wav'
import systemMenuUrl from '../assets/sounds/system-menu.wav'

/**
 * Interface sounds (owner decision): which sound plays for what. The files come from the
 * "Cosy User Interface SFX" pack (design/sounds/CREDITS.md).
 */
export type UiSound =
  'navigate' | 'section' | 'confirm' | 'back' | 'play' | 'modal-open' | 'system-menu'

/**
 * Licensed sounds that may not be redistributed are kept out of the public repo
 * (.gitignore): found here when the build has them, absent otherwise.
 */
const LICENSED = import.meta.glob<string>('../assets/sounds/licensed/*.wav', {
  eager: true,
  query: '?url',
  import: 'default'
})

/** A licensed sound the build has, or the committed one it replaces. */
export function licensedOr(found: Record<string, string>, name: string, fallback: string): string {
  const key = Object.keys(found).find((path) => path.endsWith(`/${name}.wav`))
  return key ? found[key] : fallback
}

export const UI_SOUND_URLS: Record<UiSound, string> = {
  navigate: navigateUrl,
  // JDSherbert's swipe when present (design/sounds/CREDITS.md); the move sound otherwise.
  section: licensedOr(LICENSED, 'section', navigateUrl),
  confirm: confirmUrl,
  back: backUrl,
  play: playUrl,
  'modal-open': modalOpenUrl,
  'system-menu': systemMenuUrl
}

/** Every sound at this level; the files come at full volume. Tuned by ear (owner). */
export const UI_SOUND_VOLUME = 0.5

/**
 * One press, one sound: A that opens a menu would play confirm, then the menu's own sound
 * a moment later. Within this time the stronger one wins and the other stops.
 */
export const SAME_PRESS_MS = 80

const PRIORITY: Record<UiSound, number> = {
  navigate: 0,
  section: 0,
  confirm: 1,
  back: 1,
  play: 2,
  'modal-open': 3,
  'system-menu': 4
}

export interface Voice {
  /** From the start, even when it is still playing (a held direction). */
  play(): void
  stop(): void
}

export interface UiSoundPlayer {
  play(sound: UiSound): void
}

export function createUiSoundPlayer(deps: {
  voice(sound: UiSound): Voice
  now(): number
  /** Off in Settings, a game running, the launch image up or the window in the background. */
  canPlay(): boolean
}): UiSoundPlayer {
  const voices = new Map<UiSound, Voice>()
  const voiceOf = (sound: UiSound): Voice => {
    let voice = voices.get(sound)
    if (!voice) {
      voice = deps.voice(sound)
      voices.set(sound, voice)
    }
    return voice
  }
  let last: { sound: UiSound; at: number } | null = null

  return {
    play(sound) {
      if (!deps.canPlay()) return
      const now = deps.now()
      if (last && now - last.at < SAME_PRESS_MS) {
        if (PRIORITY[sound] < PRIORITY[last.sound]) return
        if (sound !== last.sound) voiceOf(last.sound).stop()
      }
      voiceOf(sound).play()
      last = { sound, at: now }
    }
  }
}

/** The browser's audio element: the CSP allows media from the app itself only. */
export function audioVoice(sound: UiSound): Voice {
  const audio = new Audio(UI_SOUND_URLS[sound])
  audio.preload = 'auto'
  audio.volume = UI_SOUND_VOLUME
  return {
    play() {
      audio.currentTime = 0
      // A sound that cannot play (no audio device) is never an error for the user.
      audio.play()?.catch(() => {})
    },
    stop() {
      audio.pause()
      audio.currentTime = 0
    }
  }
}
