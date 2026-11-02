// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi, GameDetails, GameSummary } from '../../src/shared/ipc/contract'

const summary = (id: number, title: string, extra: Partial<GameSummary> = {}): GameSummary => ({
  id,
  title,
  origin: 'manual',
  originName: 'PC',
  installed: true,
  playtime: 742,
  timeLastPlayed: `2026-11-0${id}T10:00:00Z`,
  beated: false,
  artwork: [],
  ...extra
})

const games = [summary(1, 'Ember Knights'), summary(2, 'Tidebound')]

const details = (game: GameSummary): GameDetails => ({
  ...game,
  description: 'Uma descrição.',
  developer: 'Estúdio A',
  releaseDate: '2020-05-01',
  requiredAge: '14',
  genres: ['Ação'],
  achievements: { total: 50, unlocked: 16, platinum: false }
})

function installApi(api: Partial<EquonApi['games']> = {}): void {
  const equon: EquonApi = {
    app: { getInfo: async () => ({ name: 'equon', version: '0.1.0' }) },
    games: {
      list: api.list ?? (async () => games),
      get: api.get ?? (async (id) => details(games.find((g) => g.id === id) as GameSummary))
    }
  }
  Object.defineProperty(window, 'equon', { value: equon, configurable: true })
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
    expect(screen.getByLabelText('Jogar').getAttribute('aria-disabled')).toBe('true')

    press('Escape')
    expect(await screen.findByText('12h 22m')).toBeTruthy()

    press('e')
    expect(await screen.findByText('2 jogos')).toBeTruthy()
    press('e')
    expect(await screen.findByText('A área de conquistas chegará em breve.')).toBeTruthy()
    press('e') // no wrap-around
    expect(screen.getByText('A área de conquistas chegará em breve.')).toBeTruthy()
  })

  it('opens and closes the options menu with the menu action', async () => {
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    expect(await screen.findByRole('dialog', { name: 'Tidebound' })).toBeTruthy()
    expect(screen.getAllByText('Em breve')).toHaveLength(3)
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
    expect(await screen.findByText('Nenhum jogo para mostrar ainda.')).toBeTruthy()
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
