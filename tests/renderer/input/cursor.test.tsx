// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../src/renderer/src/App'
import { createCursorHider, type CursorHider } from '../../../src/renderer/src/input/cursor'
import { installFakeApi, summary } from '../fake-api'

const isHidden = (): boolean => document.documentElement.hasAttribute('data-cursor-hidden')
const move = (x: number, y: number): void => {
  fireEvent.mouseMove(window, { screenX: x, screenY: y })
}

describe('cursor hider', () => {
  let hider: CursorHider | undefined
  afterEach(() => {
    hider?.stop()
    hider = undefined
  })

  it('hides, and the mouse brings it back', () => {
    hider = createCursorHider()
    expect(isHidden()).toBe(false)
    hider.hide()
    expect(isHidden()).toBe(true)
    move(10, 10)
    expect(isHidden()).toBe(false)
  })

  it('stays hidden on the moves Chromium sends when the screen changes under a still cursor', () => {
    hider = createCursorHider()
    move(10, 10)
    hider.hide()
    move(10, 10)
    move(10, 10)
    expect(isHidden()).toBe(true)
    move(11, 10)
    expect(isHidden()).toBe(false)
  })

  it('a click brings it back', () => {
    hider = createCursorHider()
    hider.hide()
    fireEvent.mouseDown(window)
    expect(isHidden()).toBe(false)
  })

  it('shows the cursor and stops listening when stopped', () => {
    hider = createCursorHider()
    hider.hide()
    hider.stop()
    expect(isHidden()).toBe(false)
  })
})

describe('the controller and the cursor in the app', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const start = async (): Promise<{
    focus: { current: boolean }
    set: (state: { button?: number; axis?: number }) => Promise<void>
  }> => {
    installFakeApi([summary(1, 'Tidebound')])
    const focus = { current: true }
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focus.current)
    let state: { button?: number; axis?: number } = {}
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [
        {
          buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === state.button })),
          axes: [state.axis ?? 0, 0, 0, 0]
        }
      ]
    })
    render(<App />)
    await screen.findByText('12h 22m')
    return {
      focus,
      set: async (next) => {
        state = next
        await act(() => new Promise((resolve) => setTimeout(resolve, 60)))
      }
    }
  }

  it('hides on a button, and comes back with the mouse', async () => {
    const { set } = await start()
    expect(isHidden()).toBe(false)
    await set({ button: 13 })
    expect(isHidden()).toBe(true)
    await set({})
    expect(isHidden()).toBe(true)
    act(() => move(5, 5))
    expect(isHidden()).toBe(false)
  })

  it('hides on the stick too', async () => {
    const { set } = await start()
    await set({ axis: 1 })
    expect(isHidden()).toBe(true)
  })

  it('hides on a button with no action', async () => {
    const { set } = await start()
    await set({ button: 8 })
    expect(isHidden()).toBe(true)
  })

  it('does not hide on a resting stick or the keyboard', async () => {
    const { set } = await start()
    await set({ axis: 0.05 })
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' })
    })
    expect(isHidden()).toBe(false)
  })

  it('ignores the controller without the focus: it may belong to a game', async () => {
    const { focus, set } = await start()
    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })
    focus.current = false
    await set({ button: 0 })
    expect(isHidden()).toBe(false)
  })
})
