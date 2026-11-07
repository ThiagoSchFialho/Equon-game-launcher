// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import { COVER_HASH, isCoverPage, renderCover } from '../../src/renderer/src/cover'
import { installFakeApi, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}

describe('input under the launch cover', () => {
  const start = async (): Promise<{
    setActive: (active: boolean) => void
    cancel: ReturnType<typeof vi.fn<() => Promise<void>>>
  }> => {
    let listener: (active: boolean) => void = () => {}
    const cancel = vi.fn<() => Promise<void>>(async () => {})
    installFakeApi([summary(1, 'Tidebound')], {
      games: {
        cancelLaunchCover: cancel,
        onLaunchCoverChanged: (next) => {
          listener = next
          return () => {}
        }
      }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    return { setActive: (active) => act(() => listener(active)), cancel }
  }

  it('Back takes the image away, and leaves the screen below where it was', async () => {
    const { setActive, cancel } = await start()
    press('Enter')
    await screen.findByLabelText('Jogar')
    setActive(true)
    press('Escape')
    expect(cancel).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Jogar')).toBeTruthy()
  })

  it('nothing else reacts below the image', async () => {
    const { setActive, cancel } = await start()
    setActive(true)
    press('Enter')
    press('m')
    press('Home')
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByLabelText('Jogar')).toBeNull()
    expect(cancel).not.toHaveBeenCalled()
  })

  it('everything reacts again when it leaves', async () => {
    const { setActive } = await start()
    setActive(true)
    setActive(false)
    press('Enter')
    await waitFor(() => expect(screen.getByLabelText('Jogar')).toBeTruthy())
  })
})

describe('the cover page', () => {
  const page = (query: Record<string, string>): HTMLElement => {
    const root = document.createElement('div')
    renderCover(root, `${COVER_HASH}?${new URLSearchParams(query)}`)
    return root
  }

  it('knows its address, and no other', () => {
    expect(isCoverPage('#cover')).toBe(true)
    expect(isCoverPage('#cover?game=1')).toBe(true)
    expect(isCoverPage('')).toBe(false)
    expect(isCoverPage('#coverage')).toBe(false)
  })

  it('shows the background, filling the screen', () => {
    const image = page({ game: '7', art: 'background', version: 'v1' }).querySelector('img')
    expect(image?.getAttribute('src')).toBe('equon-art://game/7/background?v=v1')
    expect(image?.style.objectFit).toBe('cover')
  })

  it('shows the launch image the same way', () => {
    const image = page({ game: '7', art: 'launch', version: 'v1' }).querySelector('img')
    expect(image?.getAttribute('src')).toBe('equon-art://game/7/launch?v=v1')
    expect(image?.style.objectFit).toBe('cover')
  })

  it('without one, shows the logo whole', () => {
    const image = page({ game: '7', art: 'logo' }).querySelector('img')
    expect(image?.getAttribute('src')).toBe('equon-art://game/7/logo')
    expect(image?.style.objectFit).toBe('contain')
  })

  it('without one either, shows the title as text', () => {
    const root = page({ game: '7', art: '', title: '<b>Tidebound</b>' })
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('b')).toBeNull()
    expect(root.textContent).toBe('<b>Tidebound</b>')
  })

  it('takes no address from outside', () => {
    const root = page({ game: 'x', art: 'background', title: 'Tidebound' })
    expect(root.querySelector('img')).toBeNull()
    expect(page({ game: '7', art: 'https://example.com/a.png' }).querySelector('img')).toBeNull()
  })
})
