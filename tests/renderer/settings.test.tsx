// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi } from '../../src/shared/ipc/contract'
import { details, installFakeApi, settingsInfo, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const type = (text: string): void => {
  for (const key of text) press(key)
}
const click = async (label: string | RegExp): Promise<void> => {
  const [element] = await screen.findAllByLabelText(label)
  act(() => element.click())
}
const clickText = async (text: string | RegExp): Promise<void> => {
  const [element] = await screen.findAllByText(text)
  act(() => (element.closest('button') ?? element).click())
}
const focusedLabel = (): string | null =>
  document.querySelector('[data-focused="true"]')?.getAttribute('aria-label') ?? null

const openSettings = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('12h 22m')
  await click('Configurações')
  await screen.findByRole('heading', { name: 'Conexões' })
}

describe('settings', () => {
  it('keeps the initial focus on the screen content, not on the gear', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    render(<App />)
    await screen.findByText('12h 22m')
    await waitFor(() => expect(focusedLabel()).toBe('Tidebound'))
  })

  it('saves the SteamID with the on-screen keyboard and shows key states only', async () => {
    const setSteamId = vi.fn<EquonApi['settings']['setSteamId']>(async (steamId) => ({
      ok: true,
      data: settingsInfo({ steamId })
    }))
    installFakeApi([summary(1, 'Tidebound')], {
      settings: { get: async () => settingsInfo({ steamApiKey: true }), setSteamId }
    })
    await openSettings()
    expect(screen.getByText('Configurada')).toBeTruthy()
    expect(screen.getByText('Não configurada')).toBeTruthy()

    await click('ID Steam')
    type('76561197960287930')
    press('Enter')
    await waitFor(() => expect(setSteamId).toHaveBeenCalledWith('76561197960287930'))
    expect(await screen.findByText('76561197960287930')).toBeTruthy()
  })

  it('sends a new key once, then shows it as configured, and removes it', async () => {
    const setSecret = vi.fn<EquonApi['settings']['setSecret']>(async (kind, value) => ({
      ok: true,
      data: settingsInfo({ steamGridDbKey: kind === 'steamgriddb-api-key' && value !== null })
    }))
    installFakeApi([summary(1, 'Tidebound')], { settings: { setSecret } })
    await openSettings()
    const [, gridConfigure] = await screen.findAllByLabelText('Configurar')
    act(() => gridConfigure.click())
    expect(await screen.findByRole('dialog', { name: 'Chave do SteamGridDB' })).toBeTruthy()
    type('abc123def456ghi789')
    press('Enter')
    await waitFor(() =>
      expect(setSecret).toHaveBeenCalledWith('steamgriddb-api-key', 'abc123def456ghi789')
    )
    expect(await screen.findByText('Configurada')).toBeTruthy()
    expect(document.body.textContent).not.toContain('abc123def456ghi789')

    await click('Remover')
    expect(setSecret).toHaveBeenLastCalledWith('steamgriddb-api-key', null)
  })

  it('shows field errors from main', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: {
        setSecret: async () => ({
          ok: false,
          error: { code: 'secrets-unavailable', field: 'steam-api-key' }
        })
      }
    })
    await openSettings()
    const [steamConfigure] = await screen.findAllByLabelText('Configurar')
    act(() => steamConfigure.click())
    type('abc123def456ghi789')
    press('Enter')
    expect(
      await screen.findByText('O Windows não permitiu guardar a chave com segurança.')
    ).toBeTruthy()
  })

  it('refreshes the library and shows the result; connection tests are not available yet', async () => {
    const refresh = vi.fn<EquonApi['library']['refresh']>(async () => ({
      status: 'partial',
      reason: 'library-unreadable',
      added: 0,
      missing: 0,
      unknown: 3,
      duplicates: 0,
      finishedAt: '2026-11-03T22:00:00Z'
    }))
    installFakeApi([summary(1, 'Tidebound')], { library: { refresh } })
    await openSettings()
    expect(screen.getAllByLabelText('Testar conexão')[0].getAttribute('aria-disabled')).toBe('true')
    await click('Atualizar biblioteca')
    expect(refresh).toHaveBeenCalledOnce()
    expect(
      await screen.findByText(
        'Atualização parcial: uma biblioteca não pôde ser lida (disco desconectado?).'
      )
    ).toBeTruthy()
  })

  it('shows basic system information under Sobre and goes back with B', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await openSettings()
    await clickText('Sobre')
    expect(await screen.findByText('Windows 11 Pro (10.0.26300)')).toBeTruthy()
    expect(screen.getByText('C:\\Program Files (x86)\\Steam')).toBeTruthy()
    expect(screen.getByText('44.10.1')).toBeTruthy()
    press('Escape')
    expect(await screen.findByText('12h 22m')).toBeTruthy()
  })
})

describe('Steam games on the game page', () => {
  it('waits for Steam and explains a timeout', async () => {
    let finish: (value: Awaited<ReturnType<EquonApi['games']['launch']>>) => void = () => {}
    const game = summary(1, 'Balatro', { origin: 'steam', originName: 'Steam' })
    installFakeApi([game], {
      games: {
        launch: () => new Promise((resolve) => (finish = resolve))
      }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('Enter')
    await click('Jogar')
    expect(await screen.findByText('Abrindo pela Steam…')).toBeTruthy()
    act(() => finish({ ok: false, error: { code: 'start-timeout' } }))
    expect(
      await screen.findByText('A Steam não iniciou o jogo a tempo. Tente de novo.')
    ).toBeTruthy()
  })

  it('explains a game Steam is updating', async () => {
    const game = summary(1, 'Counter-Strike 2', { origin: 'steam', originName: 'Steam' })
    installFakeApi([game], {
      games: { get: async () => details(game, { launchIssue: 'steam-busy', launchable: false }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('Enter')
    expect(
      await screen.findByText('A Steam está instalando ou atualizando este jogo.')
    ).toBeTruthy()
  })
})
