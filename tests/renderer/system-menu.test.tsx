// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import { createGamepadMapper } from '../../src/renderer/src/input/gamepad'
import { keyToAction } from '../../src/renderer/src/input/keyboard'
import { installFakeApi, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const clickText = async (text: string | RegExp): Promise<void> => {
  const [element] = await screen.findAllByText(text)
  act(() => (element.closest('button') ?? element).click())
}
const menu = (): HTMLElement | null => screen.queryByRole('dialog', { name: 'Menu do sistema' })
const rows = (): (string | null)[] =>
  [...document.querySelectorAll('.choice .choice__label')].map((row) => row.textContent)
const focused = (): string | null =>
  document.querySelector('[data-focused="true"]')?.textContent ?? null

const start = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('12h 22m')
  await waitFor(() => expect(document.querySelector('[data-focused="true"]')).toBeTruthy())
}
const openMenu = async (): Promise<void> => {
  press('Home')
  await screen.findByRole('dialog', { name: 'Menu do sistema' })
}

describe('system menu', () => {
  it('the Xbox button and the Home key are the same action', () => {
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 16 }))
    expect(createGamepadMapper().update([{ buttons, axes: [] }], 0)).toEqual(['system'])
    expect(keyToAction('Home', false)).toBe('system')
    // Holding the key must not open and close it repeatedly.
    expect(keyToAction('Home', true)).toBeNull()
  })

  it('has the items in the agreed order, with shutdown in red and the gear gone', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await start()
    expect(screen.queryByLabelText('Configurações')).toBeNull()
    await openMenu()
    expect(rows()).toEqual(['Mudar para tela cheia', 'Configurações', 'Desligar sistema', 'Sair'])
    const shutdown = screen.getByText('Desligar sistema').closest('button') as HTMLElement
    expect(shutdown.dataset.tone).toBe('danger')
    expect(focused()).toContain('Mudar para tela cheia')
  })

  it('shows the hints of the menu, not of the screen below', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await start()
    const hints = (): string => document.querySelector('.footer__hints')?.textContent ?? ''
    expect(hints()).toContain('Opções')
    await openMenu()
    expect(hints()).not.toContain('Opções')
    expect(hints()).toContain('Selecionar')
    expect(hints()).toContain('Voltar')
    press('Escape')
    await waitFor(() => expect(hints()).toContain('Opções'))
  })

  it('opens from the footer icon and closes with it, with B and with the Xbox button', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await start()
    const icon = screen.getByLabelText('Menu do sistema')
    expect(icon.closest('footer')).toBeTruthy()

    act(() => icon.click())
    await waitFor(() => expect(menu()).toBeTruthy())
    act(() => icon.click())
    await waitFor(() => expect(menu()).toBeNull())

    await openMenu()
    press('Escape')
    await waitFor(() => expect(menu()).toBeNull())
    await waitFor(() => expect(focused()).toContain('Tidebound'))

    await openMenu()
    press('Home')
    await waitFor(() => expect(menu()).toBeNull())
    await waitFor(() => expect(focused()).toContain('Tidebound'))
  })

  it('names the fullscreen item after the current state and toggles it', async () => {
    const toggleFullscreen = vi.fn(async () => false)
    installFakeApi([summary(1, 'Tidebound')], {
      app: { isFullscreen: async () => true, toggleFullscreen }
    })
    await start()
    press('Home')
    await clickText('Mudar para modo janela')
    expect(toggleFullscreen).toHaveBeenCalledOnce()
    await waitFor(() => expect(menu()).toBeNull())
  })

  it('opens the settings', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await start()
    await openMenu()
    await clickText('Configurações')
    await screen.findByRole('heading', { name: 'Conexões' })
    expect(menu()).toBeNull()
  })

  it('does not open the settings over a form with unsaved work', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await start()
    press('e')
    await screen.findByText('1 jogo')
    await clickText('Adicionar jogo')
    await screen.findByRole('heading', { name: 'Adicionar jogo' })
    await openMenu()
    const settings = (await screen.findByText('Configurações')).closest('button') as HTMLElement
    expect(settings.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Salve ou cancele antes')).toBeTruthy()
    act(() => settings.click())
    expect(screen.queryByRole('heading', { name: 'Conexões' })).toBeNull()
    expect(menu()).toBeTruthy()
  })

  it('asks before shutting down, starts on Cancelar and comes back to the list', async () => {
    const shutdown = vi.fn(async () => ({ ok: true as const, data: null }))
    installFakeApi([summary(1, 'Tidebound')], { app: { shutdown } })
    await start()
    await openMenu()
    await clickText('Desligar sistema')
    await screen.findByText('O computador será desligado agora.')
    await waitFor(() => expect(focused()).toContain('Cancelar'))
    expect(shutdown).not.toHaveBeenCalled()

    press('Enter')
    await waitFor(() => expect(menu()).toBeTruthy())
    expect(shutdown).not.toHaveBeenCalled()

    await clickText('Desligar sistema')
    await clickText('Desligar')
    expect(shutdown).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('explains a shutdown Windows refused and stays open', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      app: { shutdown: async () => ({ ok: false, error: { code: 'shutdown-failed' } }) }
    })
    await start()
    await openMenu()
    await clickText('Desligar sistema')
    await clickText('Desligar')
    await screen.findByText(/O Windows não permitiu desligar/)
  })

  it('asks before quitting', async () => {
    const quit = vi.fn(async () => null)
    installFakeApi([summary(1, 'Tidebound')], { app: { quit } })
    await start()
    await openMenu()
    await clickText('Sair')
    await screen.findByText('O Equon será fechado.')
    await waitFor(() => expect(focused()).toContain('Cancelar'))
    expect(quit).not.toHaveBeenCalled()
    const confirm = screen
      .getAllByText('Sair')
      .map((el) => el.closest('button'))
      .find(Boolean) as HTMLElement
    act(() => confirm.click())
    expect(quit).toHaveBeenCalledOnce()
  })

  it('warns when a game is open', async () => {
    installFakeApi([summary(1, 'Tidebound')], { games: { running: async () => [1] } })
    await start()
    await openMenu()
    await clickText('Sair')
    await screen.findByText(/Há um jogo aberto. Ele continua rodando/)
    press('Escape')
    await clickText('Desligar sistema')
    await screen.findByText(/Há um jogo aberto. O computador será desligado/)
  })

  it('opens above a dialog, which is still there when it closes', async () => {
    installFakeApi([summary(1, 'Tidebound')])
    await start()
    press('m')
    await screen.findByRole('dialog', { name: 'Tidebound' })
    await openMenu()
    expect(focused()).toContain('Mudar para tela cheia')
    press('Escape')
    await waitFor(() => expect(menu()).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Tidebound' })).toBeTruthy()
  })
})
