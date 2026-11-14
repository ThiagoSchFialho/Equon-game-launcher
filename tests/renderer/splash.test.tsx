// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import { SPLASH_TIMING } from '../../src/renderer/src/data/splash'
import { installFakeApi, settingsInfo, summary } from './fake-api'

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const splash = (): HTMLElement | null => document.querySelector('.splash')
const wait = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
/** The fake API turns the opening screen off; these tests want it on. */
const install = (refreshing: () => boolean): void => {
  installFakeApi([summary(1, 'Tidebound')], {
    settings: { get: async () => settingsInfo({ refreshing: refreshing() }) }
  })
  SPLASH_TIMING.enabled = true
}

describe('Opening screen (D-35)', () => {
  it('shows the icon and the name for at least a second, then fades out', async () => {
    install(() => false)
    render(<App />)
    expect(splash()).toBeTruthy()
    expect(screen.getByText('Equon')).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Carregando o Equon…' })).toBeTruthy()
    await wait(500)
    // Everything is in, but it does not blink: still up, and nothing below reacts.
    expect(splash()?.dataset.leaving).toBe('false')
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(screen.queryByLabelText('Jogar')).toBeNull()
    await wait(600)
    expect(splash()?.dataset.leaving).toBe('true')
    await wait(300)
    expect(splash()).toBeNull()
  })

  it('waits for the startup library refresh', async () => {
    let refreshing = true
    install(() => refreshing)
    render(<App />)
    await wait(2000)
    expect(splash()?.dataset.leaving).toBe('false')
    refreshing = false
    await wait(400)
    expect(splash()?.dataset.leaving).toBe('true')
  })

  it('never waits more than 6 s', async () => {
    install(() => true)
    render(<App />)
    await wait(5900)
    expect(splash()?.dataset.leaving).toBe('false')
    await wait(200)
    expect(splash()?.dataset.leaving).toBe('true')
  })
})
