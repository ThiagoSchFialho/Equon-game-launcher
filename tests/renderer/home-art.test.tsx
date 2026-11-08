// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi, HomeArtSettings } from '../../src/shared/ipc/contract'
import { installFakeApi, settingsInfo, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const on = (extra: Partial<HomeArtSettings> = {}): HomeArtSettings => ({
  enabled: true,
  blur: 4,
  dim: 60,
  ...extra
})
const images = (): (string | null)[] =>
  Array.from(document.querySelectorAll('.home-art__image')).map((img) => img.getAttribute('src'))

describe('Home background art', () => {
  it('shows the focused game launch image, blurred and darkened as set', async () => {
    installFakeApi(
      [summary(1, 'Tidebound', { artwork: ['launch', 'background'], artworkVersion: 'v1' })],
      {
        settings: { get: async () => settingsInfo({ homeArt: on({ blur: 6, dim: 70 }) }) }
      }
    )
    render(<App />)
    await screen.findByText('12h 22m')
    await waitFor(() => expect(images()).toEqual(['equon-art://game/1/launch?v=v1']))
    const backdrop = document.querySelector('.home-art') as HTMLElement
    expect(backdrop.style.getPropertyValue('--home-art-blur')).toBe('6')
    expect(backdrop.style.getPropertyValue('--home-art-dim')).toBe('0.7')
    // Behind the whole screen, not inside the carousel.
    expect(backdrop.parentElement?.classList.contains('home')).toBe(true)
  })

  it('falls back to the background image, and shows nothing with neither', async () => {
    installFakeApi([summary(1, 'Tidebound', { artwork: ['background'] })], {
      settings: { get: async () => settingsInfo({ homeArt: on() }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    await waitFor(() => expect(images()).toEqual(['equon-art://game/1/background']))
    cleanup()

    installFakeApi([summary(1, 'Tidebound', { artwork: ['logo'] })], {
      settings: { get: async () => settingsInfo({ homeArt: on() }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
    expect(document.querySelector('.home-art')).toBeNull()
  })

  it('shows nothing when the option is off', async () => {
    installFakeApi([summary(1, 'Tidebound', { artwork: ['launch'] })])
    render(<App />)
    await screen.findByText('12h 22m')
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))
    expect(document.querySelector('.home-art')).toBeNull()
  })

  it('changes once the focus stops, fading the new one in over the old', async () => {
    installFakeApi(
      [summary(1, 'Alpha', { artwork: ['launch'] }), summary(2, 'Beta', { artwork: ['launch'] })],
      { settings: { get: async () => settingsInfo({ homeArt: on() }) } }
    )
    render(<App />)
    await screen.findByText('12h 22m')
    await waitFor(() => expect(images()).toHaveLength(1))
    const first = images()[0]

    press('ArrowRight')
    // Not at once: a held direction would swap it on every step.
    expect(images()).toEqual([first])
    await waitFor(() => expect(images()).toHaveLength(2))
    const [under, over] = images()
    expect(under).toBe(first)
    expect(over).not.toBe(first)
    expect(over).toMatch(/^equon-art:\/\/game\/[12]\/launch$/)
    const entering = document.querySelectorAll('.home-art__image')[1]
    expect(entering.getAttribute('data-entering')).toBe('true')

    // When the fade ends, only the new one stays. jsdom has no AnimationEvent, so React listens
    // for the prefixed name there (Chromium sends the plain one).
    act(() => {
      fireEvent(entering, new Event('webkitAnimationEnd', { bubbles: true }))
    })
    expect(images()).toEqual([over])
  })
})

describe('Configurações › Aparência', () => {
  const openAppearance = async (): Promise<void> => {
    render(<App />)
    await screen.findByText('12h 22m')
    press('Home')
    act(() => screen.getByText('Configurações').closest('button')?.click())
    act(() => screen.getByText('Aparência').closest('button')?.click())
    await screen.findByRole('heading', { name: 'Aparência' })
  }

  it('turns the option on, and the levels wait for it', async () => {
    const setHomeArt = vi.fn<EquonApi['settings']['setHomeArt']>(async (changes) => ({
      ok: true,
      data: settingsInfo({ homeArt: { enabled: false, blur: 4, dim: 60, ...changes } })
    }))
    installFakeApi([summary(1, 'Tidebound')], { settings: { setHomeArt } })
    await openAppearance()
    const blur = screen.getByRole('slider', { name: 'Desfoque' })
    const dim = screen.getByRole('slider', { name: 'Escurecimento' })
    expect(blur.getAttribute('aria-disabled')).toBe('true')
    expect(dim.getAttribute('aria-valuetext')).toBe('60%')

    // Unavailable: a direction is not used, so nothing is saved.
    act(() => blur.click())
    press('ArrowRight')
    expect(setHomeArt).not.toHaveBeenCalled()

    act(() =>
      screen.getByRole('checkbox', { name: 'Mostrar arte do jogo como background' }).click()
    )
    await waitFor(() => expect(setHomeArt).toHaveBeenCalledWith({ enabled: true }))
    expect(screen.getByRole('slider', { name: 'Desfoque' }).getAttribute('aria-disabled')).toBe(
      'false'
    )
  })

  it('steps each level with left and right, within its range, at once', async () => {
    const setHomeArt = vi.fn<EquonApi['settings']['setHomeArt']>(async (changes) => ({
      ok: true,
      data: settingsInfo({ homeArt: { enabled: true, blur: 4, dim: 80, ...changes } })
    }))
    installFakeApi([summary(1, 'Tidebound')], {
      settings: {
        get: async () => settingsInfo({ homeArt: on({ dim: 80 }) }),
        setHomeArt
      }
    })
    await openAppearance()
    act(() => screen.getByRole('slider', { name: 'Desfoque' }).click())
    press('ArrowRight')
    press('ArrowRight')
    expect(setHomeArt.mock.calls.map((call) => call[0])).toEqual([{ blur: 5 }, { blur: 6 }])
    expect(screen.getByRole('slider', { name: 'Desfoque' }).getAttribute('aria-valuenow')).toBe('6')

    act(() => screen.getByRole('slider', { name: 'Escurecimento' }).click())
    press('ArrowRight')
    expect(setHomeArt).toHaveBeenLastCalledWith({ dim: 90 })
    // At the top of the range the direction is not used: it moves the focus on instead.
    const calls = setHomeArt.mock.calls.length
    press('ArrowRight')
    expect(setHomeArt.mock.calls.length).toBe(calls)

    // The mouse uses − and +.
    act(() => screen.getByRole('button', { name: 'Escurecimento: −' }).click())
    expect(setHomeArt).toHaveBeenLastCalledWith({ dim: 80 })
  })
})
