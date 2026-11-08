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
const openSettings = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('12h 22m')
  await click('Menu do sistema')
  await clickText('Configurações')
  await screen.findByRole('heading', { name: 'Conexões' })
}

describe('settings', () => {
  it('has a clickable way back, which does not take the initial focus', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await openSettings()
    const back = screen.getByText('Início').closest('button') as HTMLElement
    expect(back.className).toBe('back-link')
    expect(document.querySelector('[data-focused="true"]')?.textContent).toContain('Conexões')
    act(() => back.click())
    await waitFor(() => expect(document.querySelector('.top-bar')).toBeTruthy())
    expect(screen.queryByRole('heading', { name: 'Conexões' })).toBeNull()
  })

  it('has no navigation bar: B is the way back, and background work shows in the footer', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      activity: {
        current: async () => ({ task: 'artwork', done: 3, total: 9 }),
        onChanged: () => () => {}
      }
    })
    await openSettings()
    expect(document.querySelector('.top-bar')).toBeNull()
    expect(document.querySelector('.footer .activity-indicator')?.textContent).toBe(
      'Baixando artes… 3 de 9'
    )
    press('Escape')
    await waitFor(() => expect(document.querySelector('.top-bar')).toBeTruthy())
    expect(screen.queryByRole('heading', { name: 'Conexões' })).toBeNull()
  })

  it('Sistema: each checkbox saves at once and shows what main answered', async () => {
    const setStartFullscreen = vi.fn<EquonApi['settings']['setStartFullscreen']>(
      async (startFullscreen) => ({ ok: true, data: settingsInfo({ startFullscreen }) })
    )
    const setOpenAtLogin = vi.fn<EquonApi['settings']['setOpenAtLogin']>(async (openAtLogin) => ({
      ok: true,
      data: settingsInfo({ openAtLogin })
    }))
    installFakeApi([summary(1, 'Tidebound')], { settings: { setStartFullscreen, setOpenAtLogin } })
    await openSettings()
    await clickText('Sistema')
    await screen.findByRole('heading', { name: 'Sistema' })

    const fullscreen = screen.getByRole('checkbox', { name: 'Iniciar em tela cheia' })
    expect(fullscreen.getAttribute('aria-checked')).toBe('false')
    act(() => fullscreen.click())
    await waitFor(() => expect(fullscreen.getAttribute('aria-checked')).toBe('true'))
    expect(setStartFullscreen).toHaveBeenCalledWith(true)

    const login = screen.getByRole('checkbox', { name: 'Iniciar com o sistema' })
    act(() => login.click())
    await waitFor(() => expect(login.getAttribute('aria-checked')).toBe('true'))
    expect(setOpenAtLogin).toHaveBeenCalledWith(true)
  })

  it('Sistema: starting with Windows is explained and does nothing when unavailable', async () => {
    const setOpenAtLogin = vi.fn<EquonApi['settings']['setOpenAtLogin']>()
    installFakeApi([summary(1, 'Tidebound')], {
      settings: {
        get: async () => settingsInfo({ openAtLoginAvailable: false }),
        setOpenAtLogin
      }
    })
    await openSettings()
    await clickText('Sistema')
    const login = await screen.findByRole('checkbox', { name: 'Iniciar com o sistema' })
    expect(login.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Disponível só na versão instalada do Equon.')).toBeTruthy()
    act(() => login.click())
    expect(setOpenAtLogin).not.toHaveBeenCalled()
  })

  it('Sistema: a refused change keeps the box as it was and says why', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: {
        setOpenAtLogin: async () => ({ ok: false, error: { code: 'login-item-failed' } })
      }
    })
    await openSettings()
    await clickText('Sistema')
    const login = await screen.findByRole('checkbox', { name: 'Iniciar com o sistema' })
    act(() => login.click())
    expect((await screen.findByRole('alert')).textContent).toBe(
      'O Windows não aceitou esta alteração. Tente de novo.'
    )
    expect(login.getAttribute('aria-checked')).toBe('false')
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
    expect(screen.getAllByText('Não configurada')).toHaveLength(3)

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

  it('starts Conexões with the library, and focusing it shows the top, title included', async () => {
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollTo = scrollTo
    try {
      installFakeApi([summary(1, 'Tidebound')])
      await openSettings()
      const rows = [...document.querySelectorAll('.settings__sections > *')]
      expect(rows[0]?.className).toBe('settings__library')

      // jsdom has no layout for the directions: a click focuses it the same way.
      await click('Atualizar biblioteca')
      await waitFor(() =>
        expect(document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')).toBe(
          'Atualizar biblioteca'
        )
      )
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
      expect(scrollTo.mock.contexts.at(-1)).toBe(document.querySelector('.settings__content'))
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
    }
  })

  it('refreshes the library and shows the result; connection tests are not available yet', async () => {
    const refresh = vi.fn<EquonApi['library']['refresh']>(async () => ({
      status: 'partial',
      reason: 'library-unreadable',
      added: 0,
      missing: 0,
      unknown: 3,
      duplicates: 0,
      ownedError: null,
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

  it('always answers a refresh: time, new games, and why owned games were not read', async () => {
    const refresh = vi.fn<EquonApi['library']['refresh']>(async () => ({
      status: 'complete',
      reason: null,
      added: 12,
      missing: 0,
      unknown: 0,
      duplicates: 0,
      ownedError: null,
      finishedAt: '2026-11-03T22:00:00Z'
    }))
    installFakeApi([summary(1, 'Tidebound')], { library: { refresh } })
    await openSettings()
    await click('Atualizar biblioteca')
    expect(
      await screen.findByText(/^Biblioteca atualizada às \d\d:\d\d · 12 jogos novos$/)
    ).toBeTruthy()

    refresh.mockResolvedValueOnce({
      status: 'complete',
      reason: null,
      added: 0,
      missing: 0,
      unknown: 0,
      duplicates: 0,
      ownedError: 'not-configured',
      finishedAt: '2026-11-03T22:05:00Z'
    })
    await click('Atualizar biblioteca')
    expect(await screen.findByText(/· nenhuma novidade$/)).toBeTruthy()
    expect(
      screen.getByText('Configure o ID Steam e a chave da API para trazer os jogos não instalados.')
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

describe('on-screen keyboard paste', () => {
  const paste = (text: string): void => {
    const event = new Event('paste', { cancelable: true }) as Event & {
      clipboardData: { getData: () => string }
    }
    event.clipboardData = { getData: () => text }
    act(() => {
      window.dispatchEvent(event)
    })
  }

  it('pastes clipboard text on one line, digits only for numbers', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await openSettings()
    await click('ID Steam')
    const dialog = await screen.findByRole('dialog', { name: 'ID Steam' })
    paste(' 7656119 7960287930\n')
    expect(dialog.querySelector('.keyboard__input')?.textContent).toBe('76561197960287930')
    press('Escape')

    const [configure] = await screen.findAllByLabelText('Configurar')
    act(() => configure.click())
    const keyDialog = await screen.findByRole('dialog', { name: 'Chave da Steam API' })
    paste('ABC\r\nDEF')
    expect(keyDialog.querySelector('.keyboard__input')?.textContent).toBe('ABC DEF')
  })
})

describe('connection tests and sync status', () => {
  it('tests Steam and explains a private profile and errors', async () => {
    const testConnection = vi
      .fn<EquonApi['settings']['testConnection']>()
      .mockResolvedValueOnce({ ok: true, data: { personaName: 'Jogador', gamesVisible: true } })
      .mockResolvedValueOnce({ ok: true, data: { personaName: 'Jogador', gamesVisible: false } })
      .mockResolvedValueOnce({ ok: false, error: { code: 'invalid-key' } })
    installFakeApi([summary(1, 'Tidebound')], {
      settings: {
        get: async () =>
          settingsInfo({
            steamId: '76561197960287930',
            steamApiKey: true,
            lastSync: {
              status: 'failed',
              error: 'private-profile',
              games: 0,
              finishedAt: '2026-11-04T02:00:00Z'
            }
          }),
        testConnection
      }
    })
    await openSettings()
    expect(
      screen.getByText(
        'Tempo de jogo não sincronizado: os detalhes de jogos do perfil são privados.'
      )
    ).toBeTruthy()
    const [steamTest, gridTest] = screen.getAllByLabelText('Testar conexão')
    expect(gridTest.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Configure a chave para testar.')).toBeTruthy()

    act(() => steamTest.click())
    expect(await screen.findByText('Conectado como Jogador.')).toBeTruthy()
    expect(testConnection).toHaveBeenCalledWith('steam')
    act(() => steamTest.click())
    expect(
      await screen.findByText(/os detalhes de jogos do perfil são privados: o tempo/)
    ).toBeTruthy()
    act(() => steamTest.click())
    expect(await screen.findByText('Chave inválida.')).toBeTruthy()
  })

  it('shows a successful sync', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: {
        get: async () =>
          settingsInfo({
            lastSync: { status: 'ok', error: null, games: 31, finishedAt: '2026-11-04T02:12:00Z' }
          })
      }
    })
    await openSettings()
    expect(
      await screen.findByText(/^Tempo de jogo sincronizado às .* \(31 jogos\)\.$/)
    ).toBeTruthy()
  })
})

describe('duplicate review', () => {
  it('shows candidates in Settings and lets the user keep, hide or remove', async () => {
    let list = [
      { manualGameId: 7, manualTitle: 'Balatro', steamTitle: 'Balatro' },
      { manualGameId: 8, manualTitle: 'Celeste', steamTitle: 'Celeste' }
    ]
    const dismissDuplicate = vi.fn<EquonApi['library']['dismissDuplicate']>(async (id) => {
      list = list.filter((d) => d.manualGameId !== id)
    })
    const setFlags = vi.fn<EquonApi['games']['setFlags']>(async (id) => {
      list = list.filter((d) => d.manualGameId !== id)
      return { ok: true, data: null }
    })
    installFakeApi([summary(1, 'Tidebound')], {
      library: { duplicates: async () => list, dismissDuplicate },
      games: { setFlags }
    })
    await openSettings()
    expect(await screen.findByText('2 possíveis duplicatas para revisar.')).toBeTruthy()
    await click('Revisar')
    expect(await screen.findByText(/O jogo manual "Balatro" parece ser "Balatro"/)).toBeTruthy()
    await clickText('Manter os dois')
    expect(dismissDuplicate).toHaveBeenCalledWith(7)
    expect(await screen.findByText(/O jogo manual "Celeste"/)).toBeTruthy()
    await clickText('Ocultar o jogo manual')
    expect(setFlags).toHaveBeenCalledWith(8, { hidden: true })
    await waitFor(() =>
      expect(screen.queryByText(/possíveis duplicatas|possível duplicata/)).toBeNull()
    )
  })
})

describe('IGDB connection', () => {
  it('asks for both credentials before testing, and only shows if they are configured', async () => {
    const testConnection = vi.fn<EquonApi['settings']['testConnection']>(async () => ({
      ok: true,
      data: { personaName: null, gamesVisible: true }
    }))
    installFakeApi([summary(1, 'Tidebound')], { settings: { testConnection } })
    await openSettings()
    expect(screen.getByText('Client ID da Twitch')).toBeTruthy()
    expect(screen.getByText('Client Secret da Twitch')).toBeTruthy()
    expect(screen.getByText('Configure o Client ID e o Client Secret para testar.')).toBeTruthy()
    expect(testConnection).not.toHaveBeenCalled()
  })

  it('tests the connection and says the credentials are valid', async () => {
    const testConnection = vi.fn<EquonApi['settings']['testConnection']>(async () => ({
      ok: true,
      data: { personaName: null, gamesVisible: true }
    }))
    installFakeApi([summary(1, 'Tidebound')], {
      settings: {
        get: async () => settingsInfo({ igdbClientId: true, igdbClientSecret: true }),
        testConnection
      }
    })
    await openSettings()
    const buttons = screen.getAllByLabelText('Testar conexão')
    act(() => buttons[buttons.length - 1].click())
    expect(await screen.findByText('Credenciais válidas.')).toBeTruthy()
    expect(testConnection).toHaveBeenCalledWith('igdb')
  })
})

describe('replaced artwork', () => {
  it('shows the new image when the art was replaced, with no restart', async () => {
    const steam = summary(1, 'Tidebound', { artwork: ['cover_portrait'], artworkVersion: 'one' })
    const list = vi.fn<EquonApi['games']['list']>(async () => [steam])
    let changed = (): void => {}
    installFakeApi([steam], {
      games: { list },
      library: {
        onChanged: (listener) => {
          changed = listener
          return () => {}
        }
      }
    })
    render(<App />)
    const source = (): string | null =>
      document.querySelector('.home__track img')?.getAttribute('src') ?? null
    await waitFor(() => expect(source()).toBe('equon-art://game/1/cover_portrait?v=one'))

    list.mockResolvedValue([{ ...steam, artworkVersion: 'two' }])
    act(() => changed())
    await waitFor(() => expect(source()).toBe('equon-art://game/1/cover_portrait?v=two'))
  })
})
