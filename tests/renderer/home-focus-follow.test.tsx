// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi } from '../../src/shared/ipc/contract'
import { installFakeApi, settingsInfo, summary } from './fake-api'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const carouselIndex = (): string | undefined =>
  document.querySelector<HTMLElement>('.home__carousel')?.style.getPropertyValue('--index')
const focused = (): string | null =>
  document.querySelector('[data-focused="true"]')?.getAttribute('aria-label') ?? null
const title = (): string | null | undefined => document.querySelector('.home__title')?.textContent

describe('Home focus after a game closes', () => {
  it('follows the focused game when it moves to the front', async () => {
    // Most recent first: Gamma (3), Beta (2), Alpha (1).
    let games = [summary(1, 'Alpha'), summary(2, 'Beta'), summary(3, 'Gamma')]
    let changed: () => void = () => {}
    installFakeApi(games, {
      games: { list: async () => games },
      library: {
        onChanged: (listener) => {
          changed = listener
          return () => {}
        }
      }
    })
    render(<App />)
    await waitFor(() => expect(focused()).toContain('Gamma'))
    // jsdom has no layout for directions: a right click focuses the card (and opens its menu).
    const alpha = document.querySelector<HTMLElement>('[aria-label*="Alpha"]')
    act(() => {
      if (alpha) fireEvent.contextMenu(alpha)
    })
    press('Escape')
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    expect(focused()).toContain('Alpha')
    await waitFor(() => expect(title()).toBe('Alpha'))
    expect(carouselIndex()).toBe('2')

    // Alpha was just played: it is now the most recent.
    games = [summary(1, 'Alpha', { timeLastPlayed: '2026-11-13T10:00:00Z' }), games[1], games[2]]
    act(() => changed())
    await waitFor(() => expect(carouselIndex()).toBe('0'))
    expect(focused()).toContain('Alpha')
    expect(title()).toBe('Alpha')
  })

  it('moves a game started from a Home cover to the front 5 s later, focus and all', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const games = [summary(1, 'Alpha'), summary(2, 'Beta'), summary(3, 'Gamma')]
    const launch = vi.fn<EquonApi['games']['launch']>(async () => ({ ok: true, data: null }))
    installFakeApi(games, {
      games: { launch },
      settings: { get: async () => settingsInfo({ homeDirectLaunch: true }) }
    })
    render(<App />)
    await waitFor(() => expect(focused()).toContain('Gamma'))
    const alpha = document.querySelector<HTMLElement>('[aria-label*="Alpha"]')
    act(() => {
      if (alpha) fireEvent.contextMenu(alpha)
    })
    press('Escape')
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    press('Enter')
    await waitFor(() => expect(launch).toHaveBeenCalledWith(1))
    // Not yet: the Home waits a little before it reorders (owner decision).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000)
    })
    expect(carouselIndex()).toBe('2')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    await waitFor(() => expect(carouselIndex()).toBe('0'))
    expect(focused()).toContain('Alpha')
    expect(title()).toBe('Alpha')
  })
})
