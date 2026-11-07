// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import { OPENING_MS } from '../../src/renderer/src/data/opening'
import type { EquonApi } from '../../src/shared/ipc/contract'
import { installFakeApi, summary } from './fake-api'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const pass = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}
const play = async (): Promise<HTMLElement> => {
  const button = await screen.findByLabelText('Jogar')
  act(() => button.click())
  return button
}
const openGame = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('12h 22m')
  press('Enter')
  await screen.findByLabelText('Jogar')
}

const okLaunch = (): ReturnType<typeof vi.fn<EquonApi['games']['launch']>> =>
  vi.fn<EquonApi['games']['launch']>(async () => ({ ok: true, data: null }))

describe('the Play button answers every press', () => {
  it('says Abrindo and stays disabled for 10 s, even after the launch answered', async () => {
    const launch = okLaunch()
    installFakeApi([summary(1, 'Fortnite')], { games: { launch } })
    await openGame()
    await play()

    const opening = await screen.findByLabelText('Abrindo…')
    expect(opening.textContent).toContain('Abrindo…')
    expect(opening.getAttribute('aria-disabled')).toBe('true')
    await act(() => Promise.resolve())

    act(() => opening.click())
    expect(launch).toHaveBeenCalledOnce()

    // This clock also moves with real time: not too close to the limit.
    pass(OPENING_MS - 3000)
    expect(screen.getByLabelText('Abrindo…')).toBeTruthy()

    pass(3000)
    const again = await screen.findByLabelText('Jogar')
    expect(again.getAttribute('aria-disabled')).toBe('false')
    act(() => again.click())
    expect(launch).toHaveBeenCalledTimes(2)
  })

  it('does the same when the launch fails, and shows the error', async () => {
    installFakeApi([summary(1, 'Fortnite')], {
      games: { launch: async () => ({ ok: false, error: { code: 'start-failed' } }) }
    })
    await openGame()
    await play()
    expect(await screen.findByText(/Não foi possível iniciar o jogo/)).toBeTruthy()
    expect(screen.getByLabelText('Abrindo…').getAttribute('aria-disabled')).toBe('true')
    pass(OPENING_MS)
    expect(await screen.findByLabelText('Jogar')).toBeTruthy()
  })

  it('stays disabled after leaving the page and coming back', async () => {
    const launch = okLaunch()
    installFakeApi([summary(1, 'Fortnite')], { games: { launch } })
    await openGame()
    await play()
    await screen.findByLabelText('Abrindo…')

    press('Escape')
    await screen.findByText('12h 22m')
    press('Enter')
    const back = await screen.findByLabelText('Abrindo…')
    expect(back.getAttribute('aria-disabled')).toBe('true')
    act(() => back.click())
    expect(launch).toHaveBeenCalledOnce()
  })

  it('counts each game on its own', async () => {
    installFakeApi([summary(1, 'Fortnite'), summary(2, 'Celeste')])
    render(<App />)
    await screen.findByText('12h 22m')
    const open = async (title: string): Promise<void> => {
      const card = await screen.findByLabelText(title)
      act(() => card.click())
    }
    await open('Celeste')
    await play()
    await screen.findByLabelText('Abrindo…')
    press('Escape')
    await open('Fortnite')
    expect((await screen.findByLabelText('Jogar')).getAttribute('aria-disabled')).toBe('false')
  })

  it('a game that started says so instead', async () => {
    let emit: (ids: number[]) => void = () => {}
    installFakeApi([summary(1, 'Fortnite')], {
      games: {
        onRunningChanged: (listener) => {
          emit = listener
          return () => {}
        }
      }
    })
    await openGame()
    await play()
    await screen.findByLabelText('Abrindo…')
    act(() => emit([1]))
    expect(await screen.findByLabelText('Em execução')).toBeTruthy()
  })

  it('a Steam launch that takes longer keeps saying Abrindo until it ends', async () => {
    let finish: (value: Awaited<ReturnType<EquonApi['games']['launch']>>) => void = () => {}
    installFakeApi([summary(1, 'Balatro', { origin: 'steam', originName: 'Steam' })], {
      games: { launch: () => new Promise((resolve) => (finish = resolve)) }
    })
    await openGame()
    await play()
    pass(OPENING_MS * 2)
    expect(screen.getByLabelText('Abrindo…').getAttribute('aria-disabled')).toBe('true')
    await act(async () => finish({ ok: true, data: null }))
    await waitFor(() => expect(screen.getByLabelText('Jogar')).toBeTruthy())
  })

  it('leaves an unavailable game as it was', async () => {
    const launch = okLaunch()
    installFakeApi([summary(1, 'Missing', { installed: false })], {
      games: {
        launch,
        get: async () => ({
          ...summary(1, 'Missing', { installed: false }),
          description: null,
          developer: null,
          releaseDate: null,
          requiredAge: null,
          genres: [],
          achievements: null,
          editable: true,
          launchable: false,
          launchIssue: 'not-installed',
          tracksTime: true
        })
      }
    })
    render(<App />)
    await screen.findByText('Início')
    press('e')
    const card = await screen.findByLabelText('Missing')
    act(() => card.click())
    const button = await screen.findByLabelText('Jogar')
    act(() => button.click())
    expect(launch).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Abrindo…')).toBeNull()
  })
})
