// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi } from '../../src/shared/ipc/contract'
import { installFakeApi, settingsInfo, summary } from './fake-api'

/** Which sound files the app asked the browser to play, in order. */
let played: string[]

beforeEach(() => {
  played = []
  // jsdom has no audio: record the file instead of playing it.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    played.push(this.src.replace(/^.*\/([\w-]+)\.wav.*$/, '$1'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
/** A moment later, as a new press would be. */
const later = (): Promise<void> =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 100)))

describe('interface sounds in the app', () => {
  it('plays the modal sound when a menu opens, and back when it closes', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: { get: async () => settingsInfo({ uiSounds: true }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    // Opening the app is silent.
    expect(played).toEqual([])

    press('m')
    await screen.findByRole('dialog', { name: 'Tidebound' })
    await waitFor(() => expect(played).toEqual(['modal-open']))

    await later()
    press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(played).toEqual(['modal-open', 'back'])
  })

  it('plays its own sound when the Xbox button opens the system menu', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: { get: async () => settingsInfo({ uiSounds: true }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('Home')
    await screen.findByRole('dialog', { name: 'Menu do sistema' })
    await waitFor(() => expect(played).toEqual(['system-menu']))
  })

  it('stays silent when turned off, and Settings turns it on at once', async () => {
    const setUiSounds = vi.fn<EquonApi['settings']['setUiSounds']>(async (uiSounds) => ({
      ok: true,
      data: settingsInfo({ uiSounds })
    }))
    installFakeApi([summary(1, 'Tidebound')], { settings: { setUiSounds } })
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    await screen.findByRole('dialog', { name: 'Tidebound' })
    press('Escape')
    await later()
    expect(played).toEqual([])

    press('Home')
    act(() => screen.getByText('Configurações').closest('button')?.click())
    act(() => screen.getByText('Sistema').closest('button')?.click())
    const checkbox = await screen.findByLabelText('Sons da interface')
    act(() => checkbox.click())
    await waitFor(() => expect(setUiSounds).toHaveBeenCalledWith(true))
    // The click that turned it on was still silent.
    expect(played).toEqual([])
    await later()
    press('Escape')
    await waitFor(() => expect(played).toEqual(['back']))
  })

  it('plays the confirm sound when X changes the sort of Conquistas', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: { get: async () => settingsInfo({ uiSounds: true }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    act(() => screen.getByText('Conquistas').closest('button')?.click())
    await screen.findByRole('heading', { name: 'Conquistas' })
    await later()
    played = []
    press('x')
    await waitFor(() => expect(played).toEqual(['confirm']))
  })

  it('is silent while a game runs', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: { get: async () => settingsInfo({ uiSounds: true }) },
      games: { running: async () => [1] }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    await later()
    press('m')
    await screen.findByRole('dialog', { name: 'Tidebound' })
    await later()
    expect(played).toEqual([])
  })
})
