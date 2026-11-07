// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi, GameSummary } from '../../src/shared/ipc/contract'
import { details, installFakeApi, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const steam = (extra: Partial<GameSummary>): GameSummary =>
  summary(1, 'Portal 2', { origin: 'steam', originName: 'Steam', ...extra })

const openPage = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('Início')
  press('e')
  const card = await screen.findByLabelText('Portal 2')
  act(() => card.click())
}

describe('a Steam game that is not installed', () => {
  const notInstalled = steam({ installed: false })
  const page = (installSteam?: EquonApi['games']['installSteam']): void => {
    installFakeApi([notInstalled], {
      games: {
        get: async () => details(notInstalled, { launchable: false, launchIssue: 'not-installed' }),
        ...(installSteam ? { installSteam } : {})
      }
    })
  }

  it('offers Instalar in blue, available, instead of Jogar', async () => {
    page()
    await openPage()
    const button = await screen.findByLabelText('Instalar')
    expect(button.className).toContain('button--install')
    expect(button.getAttribute('aria-disabled')).toBe('false')
    expect(screen.queryByLabelText('Jogar')).toBeNull()
  })

  it('opens Steam, says where to go on, and does not launch', async () => {
    const installSteam = vi.fn<EquonApi['games']['installSteam']>(async () => ({
      ok: true,
      data: null
    }))
    page(installSteam)
    await openPage()
    const button = await screen.findByLabelText('Instalar')
    act(() => button.click())
    await waitFor(() => expect(installSteam).toHaveBeenCalledExactlyOnceWith(1))
    expect(await screen.findByText('Continue na janela da Steam.')).toBeTruthy()
    // The "Abrindo…" of Jogar and its image are for launching.
    expect(screen.getByLabelText('Instalar').getAttribute('aria-disabled')).toBe('false')
  })

  it('explains when Steam cannot be opened', async () => {
    page(async () => ({ ok: false, error: { code: 'steam-open-failed' } }))
    await openPage()
    const button = await screen.findByLabelText('Instalar')
    act(() => button.click())
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível abrir a Steam.')
  })

  it('has no Desinstalar in the options', async () => {
    page()
    await openPage()
    await screen.findByLabelText('Instalar')
    press('m')
    await screen.findByText('Editar artes')
    expect(screen.queryByText('Desinstalar')).toBeNull()
  })

  it('becomes Jogar when the game gets installed', async () => {
    let installed = false
    let changed: () => void = () => {}
    installFakeApi([notInstalled], {
      library: {
        onChanged: (listener) => {
          changed = listener
          return () => {}
        }
      },
      games: {
        get: async () =>
          installed
            ? details(steam({ installed: true }))
            : details(notInstalled, { launchable: false, launchIssue: 'not-installed' })
      }
    })
    await openPage()
    await screen.findByLabelText('Instalar')
    installed = true
    act(() => changed())
    expect(await screen.findByLabelText('Jogar')).toBeTruthy()
  })
})

describe('other games keep Jogar', () => {
  it.each([
    ['a Steam game in an unknown state', steam({ installed: null }), 'install-unknown'],
    [
      'a manual game with a missing file',
      summary(1, 'Portal 2', { installed: false }),
      'not-installed'
    ]
  ] as const)('%s', async (_name, game, launchIssue) => {
    installFakeApi([game], {
      games: { get: async () => details(game, { launchable: false, launchIssue }) }
    })
    await openPage()
    const button = await screen.findByLabelText('Jogar')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(screen.queryByLabelText('Instalar')).toBeNull()
  })
})

describe('Desinstalar in the options', () => {
  const installed = steam({ installed: true })
  const uninstallRow = (): HTMLElement =>
    screen.getByText('Desinstalar').closest('button') as HTMLElement

  it('on the game page: opens the confirmation of Steam, and closes the menu', async () => {
    const uninstallSteam = vi.fn<EquonApi['games']['uninstallSteam']>(async () => ({
      ok: true,
      data: null
    }))
    installFakeApi([installed], {
      games: { get: async () => details(installed), uninstallSteam }
    })
    await openPage()
    await screen.findByLabelText('Jogar')
    press('m')
    await screen.findByText('Desinstalar')
    expect(uninstallRow().dataset.tone).toBe('danger')
    act(() => uninstallRow().click())
    await waitFor(() => expect(uninstallSteam).toHaveBeenCalledExactlyOnceWith(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('on a card too', async () => {
    const uninstallSteam = vi.fn<EquonApi['games']['uninstallSteam']>(async () => ({
      ok: true,
      data: null
    }))
    installFakeApi([installed], { games: { uninstallSteam } })
    render(<App />)
    await screen.findByLabelText('Portal 2')
    press('m')
    await screen.findByText('Desinstalar')
    act(() => uninstallRow().click())
    await waitFor(() => expect(uninstallSteam).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('explains a failure, and the menu stays', async () => {
    installFakeApi([installed], {
      games: {
        get: async () => details(installed),
        uninstallSteam: async () => ({ ok: false, error: { code: 'steam-open-failed' } })
      }
    })
    await openPage()
    await screen.findByLabelText('Jogar')
    press('m')
    await screen.findByText('Desinstalar')
    act(() => uninstallRow().click())
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível abrir a Steam.')
    expect(screen.getByText('Desinstalar')).toBeTruthy()
  })

  it('not while the game is running, and not for a manual game', async () => {
    installFakeApi([installed], {
      games: { get: async () => details(installed), running: async () => [1] }
    })
    await openPage()
    await screen.findByLabelText('Em execução')
    press('m')
    await screen.findByText('Editar artes')
    expect(screen.queryByText('Desinstalar')).toBeNull()
    cleanup()

    const manual = summary(1, 'Portal 2')
    installFakeApi([manual], { games: { get: async () => details(manual) } })
    await openPage()
    await screen.findByLabelText('Jogar')
    press('m')
    await screen.findByText('Editar artes')
    expect(screen.queryByText('Desinstalar')).toBeNull()
  })
})
