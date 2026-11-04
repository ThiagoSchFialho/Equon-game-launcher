// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi } from '../../src/shared/ipc/contract'
import { installFakeApi, summary } from './fake-api'

const games = [summary(1, 'Ember Knights'), summary(2, 'Tidebound')]

function installApi(api: Partial<EquonApi['games']> = {}): void {
  installFakeApi(games, { games: api })
}

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}

const focusedTitle = (): string | null =>
  document.querySelector('.home__title')?.textContent ?? null

beforeEach(() => installApi())
afterEach(cleanup)

describe('App navigation', () => {
  it('opens a game from Home, goes back, and switches sections', async () => {
    render(<App />)

    // Home: most recently played first; the focused card shows its title and playtime.
    expect(await screen.findByText('12h 22m')).toBeTruthy()
    expect(focusedTitle()).toBe('Tidebound')

    press('Enter')
    expect(await screen.findByText('Sobre o jogo')).toBeTruthy()
    expect(screen.getByText('16 / 50')).toBeTruthy()
    expect(screen.getByAltText('Classificação indicativa: 14')).toBeTruthy()
    expect(screen.getByLabelText('Jogar').getAttribute('aria-disabled')).toBe('false')

    press('Escape')
    expect(await screen.findByText('12h 22m')).toBeTruthy()

    press('e')
    expect(await screen.findByText('2 jogos')).toBeTruthy()
    press('e')
    expect(await screen.findByText('As conquistas ainda não foram sincronizadas.')).toBeTruthy()
    press('e') // no wrap-around
    expect(await screen.findByText('As conquistas ainda não foram sincronizadas.')).toBeTruthy()
  })

  it('opens and closes the options menu with the menu action', async () => {
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    expect(await screen.findByRole('dialog', { name: 'Tidebound' })).toBeTruthy()
    expect(screen.queryByText('Em breve')).toBeNull()
    expect(screen.getByText('Marcar como zerado')).toBeTruthy()
    expect(screen.getByText('Ocultar jogo')).toBeTruthy()
    press('Escape')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows an error state with a working retry', async () => {
    const list = vi.fn<EquonApi['games']['list']>()
    list.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(games)
    installApi({ list })
    render(<App />)
    expect(await screen.findByText('Não foi possível carregar a biblioteca.')).toBeTruthy()
    press('Enter')
    expect(await screen.findByText('12h 22m')).toBeTruthy()
    expect(focusedTitle()).toBe('Tidebound')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('guides the user when the library is empty', async () => {
    installApi({ list: async () => [] })
    render(<App />)
    expect(await screen.findByText('Nenhum jogo instalado para mostrar.')).toBeTruthy()
    press('Enter')
    expect(await screen.findByText('Nenhum jogo na biblioteca ainda.')).toBeTruthy()
  })

  it('shows placeholders with the title when a game has no artwork', async () => {
    render(<App />)
    await screen.findByText('12h 22m')
    expect(document.querySelectorAll('.artwork__placeholder').length).toBeGreaterThan(0)
    expect(document.querySelector('img.artwork__image')).toBeNull()
  })
})
