// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../src/renderer/src/App'
import { createFocusClaimer } from '../../../src/renderer/src/input/focus-claim'
import { installFakeApi, summary } from '../fake-api'

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))

describe('focus claimer', () => {
  it('claims the focus once, on a new press, and ignores that press', () => {
    const claim = vi.fn(async () => true)
    const claimer = createFocusClaimer(claim)
    expect(claimer.update(false, false)).toBe(true)
    expect(claim).not.toHaveBeenCalled()

    expect(claimer.update(true, false)).toBe(true)
    expect(claimer.update(true, false)).toBe(true)
    expect(claim).toHaveBeenCalledOnce()

    // The focus arrives with the button still down: it must not press anything.
    expect(claimer.update(true, true)).toBe(true)
    expect(claimer.update(false, true)).toBe(false)
    expect(claimer.update(true, true)).toBe(false)
  })

  it('does not claim again after that: leaving the launcher is then deliberate', async () => {
    const claim = vi.fn(async () => true)
    const claimer = createFocusClaimer(claim)
    claimer.update(true, false)
    claimer.update(false, false)
    await flush()
    claimer.update(true, false)
    claimer.update(false, false)
    expect(claim).toHaveBeenCalledOnce()
  })

  it('does not claim once the launcher was used', () => {
    const claim = vi.fn(async () => true)
    const claimer = createFocusClaimer(claim)
    claimer.markUsed()
    expect(claimer.update(true, false)).toBe(true)
    expect(claim).not.toHaveBeenCalled()
  })

  it('tries again later when main refused, as with a game running', async () => {
    const claim = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(false)
    claim.mockResolvedValue(true)
    const claimer = createFocusClaimer(claim)
    claimer.update(true, false)
    claimer.update(false, false)
    await flush()
    claimer.update(true, false)
    expect(claim).toHaveBeenCalledTimes(2)
  })

  it('survives a failed request', async () => {
    const claim = vi.fn<() => Promise<boolean>>().mockRejectedValueOnce(new Error('gone'))
    claim.mockResolvedValue(true)
    const claimer = createFocusClaimer(claim)
    claimer.update(true, false)
    claimer.update(false, false)
    await flush()
    claimer.update(true, false)
    expect(claim).toHaveBeenCalledTimes(2)
  })

  it('leaves a focused launcher alone', () => {
    const claim = vi.fn(async () => true)
    const claimer = createFocusClaimer(claim)
    expect(claimer.update(true, true)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })
})

describe('the controller on a launcher without the focus', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const start = async (): Promise<{
    claimFocus: ReturnType<typeof vi.fn<() => Promise<boolean>>>
    press: (button: number, pressed: boolean) => Promise<void>
    focus: { current: boolean }
  }> => {
    const claimFocus = vi.fn<() => Promise<boolean>>(async () => true)
    installFakeApi([summary(1, 'Tidebound')], { app: { claimFocus } })
    const focus = { current: true }
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focus.current)
    let down: number | null = null
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === down })),
          axes: [0, 0, 0, 0]
        }
      ]
    })
    render(<App />)
    await screen.findByText('12h 22m')
    return {
      claimFocus,
      focus,
      press: async (button, pressed) => {
        down = pressed ? button : null
        await act(() => new Promise((resolve) => setTimeout(resolve, 60)))
      }
    }
  }

  it('comes to the front on the first press, which opens nothing', async () => {
    const { claimFocus, focus, press } = await start()
    focus.current = false
    await press(16, true)
    expect(claimFocus).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()

    // Main gave it the focus while the button is still down.
    focus.current = true
    await press(16, true)
    expect(screen.queryByRole('dialog')).toBeNull()

    await press(16, false)
    await press(16, true)
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Menu do sistema' })).toBeTruthy()
    )
  })

  it('keeps ignoring the controller in the background after the launcher was used', async () => {
    const { claimFocus, focus, press } = await start()
    await press(16, true)
    await press(16, false)
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Menu do sistema' })).toBeTruthy()
    )
    await press(16, true)
    await press(16, false)

    focus.current = false
    await press(0, true)
    await press(0, false)
    expect(claimFocus).not.toHaveBeenCalled()
  })

  it('a click counts as using it', async () => {
    const { claimFocus, focus, press } = await start()
    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })
    focus.current = false
    await press(0, true)
    expect(claimFocus).not.toHaveBeenCalled()
  })
})
