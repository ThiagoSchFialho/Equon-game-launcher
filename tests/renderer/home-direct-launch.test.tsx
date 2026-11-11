// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi } from '../../src/shared/ipc/contract'
import { installFakeApi, settingsInfo, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const clickText = async (text: string): Promise<void> => {
  const [element] = await screen.findAllByText(text)
  act(() => (element.closest('button') ?? element).click())
}
const onGamePage = (): boolean => screen.queryByLabelText('Jogar') !== null
const footer = (): string => document.querySelector('.footer__hints')?.textContent ?? ''

describe('"Ignorar tela do jogo na home" (D-28)', () => {
  it('off: A on a Home cover opens the game page, as before', async () => {
    const launch = vi.fn<EquonApi['games']['launch']>(async () => ({ ok: true, data: null }))
    installFakeApi([summary(1, 'Tidebound')], { games: { launch } })
    render(<App />)
    await screen.findByText('12h 22m')
    expect(footer()).toContain('Abrir')
    press('Enter')
    await waitFor(() => expect(onGamePage()).toBe(true))
    expect(launch).not.toHaveBeenCalled()
  })

  it('on: A on a Home cover starts the game and stays on Home', async () => {
    const launch = vi.fn<EquonApi['games']['launch']>(async () => ({ ok: true, data: null }))
    installFakeApi([summary(1, 'Tidebound')], {
      games: { launch },
      settings: { get: async () => settingsInfo({ homeDirectLaunch: true }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    await waitFor(() => expect(footer()).toContain('Jogar'))
    press('Enter')
    await waitFor(() => expect(launch).toHaveBeenCalledWith(1))
    expect(onGamePage()).toBe(false)
  })

  it('on: a game that cannot start opens its page, which says why', async () => {
    const launch = vi.fn<EquonApi['games']['launch']>(async () => ({
      ok: false,
      error: { code: 'missing' }
    }))
    installFakeApi([summary(1, 'Tidebound')], {
      games: { launch },
      settings: { get: async () => settingsInfo({ homeDirectLaunch: true }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    await waitFor(() => expect(footer()).toContain('Jogar'))
    press('Enter')
    await waitFor(() => expect(onGamePage()).toBe(true))
    expect(launch).toHaveBeenCalledOnce()
  })

  it('on: the options menu offers the game page, first', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: { get: async () => settingsInfo({ homeDirectLaunch: true }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    await waitFor(() => expect(footer()).toContain('Jogar'))
    press('m')
    await screen.findByRole('dialog', { name: 'Tidebound' })
    expect(document.querySelector('.choice__label')?.textContent).toBe('Ver página do jogo')
    await clickText('Ver página do jogo')
    await waitFor(() => expect(onGamePage()).toBe(true))
  })

  it('off: the options menu has no game page item', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    await screen.findByRole('dialog', { name: 'Tidebound' })
    expect(screen.queryByText('Ver página do jogo')).toBeNull()
  })

  it('is set in Settings › Sistema, and Home follows at once', async () => {
    const setHomeDirectLaunch = vi.fn<EquonApi['settings']['setHomeDirectLaunch']>(
      async (homeDirectLaunch) => ({ ok: true, data: settingsInfo({ homeDirectLaunch }) })
    )
    installFakeApi([summary(1, 'Tidebound')], { settings: { setHomeDirectLaunch } })
    render(<App />)
    await screen.findByText('12h 22m')
    press('Home')
    await clickText('Configurações')
    await clickText('Sistema')
    await screen.findByRole('heading', { name: 'Sistema' })
    const option = screen.getByRole('checkbox', { name: 'Ignorar tela do jogo na home' })
    expect(option.getAttribute('aria-checked')).toBe('false')
    act(() => option.click())
    await waitFor(() => expect(option.getAttribute('aria-checked')).toBe('true'))
    expect(setHomeDirectLaunch).toHaveBeenCalledWith(true)

    // B to the tab, B to Home, where A now plays.
    press('Escape')
    press('Escape')
    await screen.findByText('12h 22m')
    await waitFor(() => expect(footer()).toContain('Jogar'))
  })
})
