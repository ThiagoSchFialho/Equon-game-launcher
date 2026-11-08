import { describe, expect, it } from 'vitest'
import { createAppSounds } from '../../../src/renderer/src/sound/app-sounds'
import {
  SAME_PRESS_MS,
  UI_SOUND_URLS,
  createUiSoundPlayer,
  licensedOr,
  type UiSound
} from '../../../src/renderer/src/sound/ui-sounds'

/** Records what each fake voice was asked to do. */
function fakeVoices(): {
  log: string[]
  voice: (sound: UiSound) => { play(): void; stop(): void }
} {
  const log: string[] = []
  return {
    log,
    voice: (sound) => ({
      play: () => log.push(`play ${sound}`),
      stop: () => log.push(`stop ${sound}`)
    })
  }
}

describe('interface sound player', () => {
  it('has a file for every sound', () => {
    expect(Object.keys(UI_SOUND_URLS).sort()).toEqual(
      ['back', 'confirm', 'modal-open', 'navigate', 'play', 'section', 'system-menu'].sort()
    )
    for (const url of Object.values(UI_SOUND_URLS)) expect(url).toMatch(/\.wav/)
  })

  it('takes a licensed sound when the build has it, and the committed one otherwise', () => {
    const found = { '../assets/sounds/licensed/section.wav': '/assets/section-abc.wav' }
    expect(licensedOr(found, 'section', '/assets/navigate.wav')).toBe('/assets/section-abc.wav')
    // A clone of the public repo has no licensed files.
    expect(licensedOr({}, 'section', '/assets/navigate.wav')).toBe('/assets/navigate.wav')
    // Another name never stands in for it.
    expect(
      licensedOr(
        { '../assets/sounds/licensed/other-section.wav': '/x.wav' },
        'section',
        '/assets/navigate.wav'
      )
    ).toBe('/assets/navigate.wav')
  })

  it('plays one sound per press: the stronger one wins and the other stops', () => {
    const { log, voice } = fakeVoices()
    let now = 0
    const player = createUiSoundPlayer({ voice, now: () => now, canPlay: () => true })

    // A that opens a modal: confirm, then the modal's own sound a moment later.
    player.play('confirm')
    now += 10
    player.play('modal-open')
    expect(log).toEqual(['play confirm', 'stop confirm', 'play modal-open'])

    // A weaker one in the same press is dropped.
    now += 10
    player.play('navigate')
    expect(log).toHaveLength(3)

    // Later, it is another press.
    now += SAME_PRESS_MS
    player.play('navigate')
    expect(log.at(-1)).toBe('play navigate')
  })

  it('restarts the same sound for a held direction instead of stacking it', () => {
    const { log, voice } = fakeVoices()
    let now = 0
    const player = createUiSoundPlayer({ voice, now: () => now, canPlay: () => true })
    for (let i = 0; i < 3; i++) {
      player.play('navigate')
      now += 110
    }
    expect(log).toEqual(['play navigate', 'play navigate', 'play navigate'])
  })

  it('stays silent when it cannot play', () => {
    const { log, voice } = fakeVoices()
    const player = createUiSoundPlayer({ voice, now: () => 0, canPlay: () => false })
    player.play('confirm')
    expect(log).toEqual([])
  })
})

describe('app sounds', () => {
  const app = (focused = true): { log: string[]; sounds: ReturnType<typeof createAppSounds> } => {
    const { log, voice } = fakeVoices()
    let now = 0
    const sounds = createAppSounds({ voice, now: () => (now += 1000), hasFocus: () => focused })
    return { log, sounds }
  }

  it('is silent until Settings turns it on, and when turned off', () => {
    const { log, sounds } = app()
    sounds.play('confirm')
    expect(log).toEqual([])
    sounds.setEnabled(true)
    sounds.play('confirm')
    expect(log).toEqual(['play confirm'])
    sounds.setEnabled(false)
    sounds.play('confirm')
    expect(log).toHaveLength(1)
  })

  it('is silent while a game runs, under the launch image and in the background', () => {
    const { log, sounds } = app()
    sounds.setEnabled(true)
    sounds.setGameRunning(true)
    sounds.play('confirm')
    sounds.setGameRunning(false)
    sounds.setLaunchCover(true)
    sounds.play('confirm')
    sounds.setLaunchCover(false)
    expect(log).toEqual([])
    sounds.play('confirm')
    expect(log).toEqual(['play confirm'])

    const background = app(false)
    background.sounds.setEnabled(true)
    background.sounds.play('confirm')
    expect(background.log).toEqual([])
  })
})
