// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../../src/renderer/src/App'
import { installFakeApi, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const clickText = async (text: string): Promise<void> => {
  const [element] = await screen.findAllByText(text)
  act(() => (element.closest('button') ?? element).click())
}
const cards = (): (string | null)[] =>
  [...document.querySelectorAll('.game-card')].map((card) => card.getAttribute('aria-label'))
const badges = (title: string): (string | null)[] =>
  [...screen.getByLabelText(title).querySelectorAll('.game-card__badge')].map((badge) =>
    badge.getAttribute('title')
  )

const openLibrary = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('Início')
  await waitFor(() => expect(document.querySelector('.game-card')).toBeTruthy())
  press('e')
  await waitFor(() => expect(document.querySelector('.library__grid')).toBeTruthy())
}
const sortBy = async (label: string): Promise<void> => {
  act(() => (screen.getByLabelText(/^Ordenar/) as HTMLElement).click())
  await screen.findByRole('dialog', { name: 'Ordenar' })
  const row = [...document.querySelectorAll('.choice')].find(
    (choice) => choice.querySelector('.choice__label')?.textContent === label
  ) as HTMLElement
  act(() => row.click())
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

const LIBRARY = [
  summary(1, 'Alfa', { installed: false }),
  summary(2, 'Beta', { installed: true, beated: true }),
  summary(3, 'Gama', { installed: true, hidden: true }),
  summary(4, 'Delta', { installed: null })
]

describe('Library sorts and badges', () => {
  it('offers the sorts in order', async () => {
    installFakeApi(LIBRARY)
    await openLibrary()
    act(() => (screen.getByLabelText(/^Ordenar/) as HTMLElement).click())
    await screen.findByRole('dialog', { name: 'Ordenar' })
    expect(
      [...document.querySelectorAll('.choice__label')].map((label) => label.textContent)
    ).toEqual([
      'Título',
      'Recentes',
      'Tempo de jogo',
      '% de conquistas',
      'Origem',
      'Instalação',
      'Ocultos',
      'Zerados'
    ])
  })

  it('sorts by achievements and follows a sync that changes the percentage', async () => {
    let listeners: (() => void)[] = []
    let percent = 10
    const list = (): ReturnType<typeof summary>[] => [
      summary(1, 'Alfa', { achievementPercent: percent }),
      summary(2, 'Beta', { achievementPercent: 50 }),
      summary(3, 'Gama')
    ]
    installFakeApi(list(), {
      games: { list: async () => list() },
      achievements: {
        onChanged: (listener) => {
          listeners.push(listener)
          return () => {
            listeners = listeners.filter((other) => other !== listener)
          }
        }
      }
    })
    await openLibrary()
    await sortBy('% de conquistas')
    expect(cards()).toEqual(['Beta', 'Alfa', 'Gama'])

    percent = 100
    act(() => listeners.forEach((listener) => listener()))
    await waitFor(() => expect(cards()).toEqual(['Alfa', 'Beta', 'Gama']))
  })

  const stat = (title: string): string | null =>
    screen.getByLabelText(title).querySelector('.game-card__stat')?.textContent ?? null

  it('shows the percentage only while sorting by it, rounded down, never for no achievements', async () => {
    installFakeApi([
      summary(1, 'Quase', { achievementPercent: 99.9 }),
      summary(2, 'Zero', { achievementPercent: 0 }),
      summary(3, 'Sem')
    ])
    await openLibrary()
    expect(document.querySelector('.game-card__stat')).toBeNull()

    await sortBy('% de conquistas')
    expect(stat('Quase')).toBe('99%')
    expect(stat('Zero')).toBe('0%')
    expect(stat('Sem')).toBeNull()
    expect(screen.getByLabelText('Quase').getAttribute('aria-description')).toContain('99%')

    await sortBy('Título')
    expect(document.querySelector('.game-card__stat')).toBeNull()
  })

  it('shows hours and minutes only while sorting by playtime', async () => {
    installFakeApi([
      summary(1, 'Longo', { playtime: 742 }),
      summary(2, 'Curto', { playtime: 45 }),
      summary(3, 'Novo', { playtime: 0 })
    ])
    await openLibrary()
    await sortBy('Tempo de jogo')
    expect(stat('Longo')).toBe('12h 22m')
    expect(stat('Curto')).toBe('45m')
    expect(stat('Novo')).toBe('0m')

    await sortBy('Recentes')
    expect(document.querySelector('.game-card__stat')).toBeNull()
  })

  it('shows hidden games while sorting by them, and hides them again after', async () => {
    installFakeApi(LIBRARY)
    await openLibrary()
    expect(cards()).toEqual(['Alfa', 'Beta', 'Delta'])
    expect(screen.getByText('3 jogos')).toBeTruthy()

    await sortBy('Ocultos')
    expect(cards()).toEqual(['Gama', 'Alfa', 'Beta', 'Delta'])
    expect(screen.getByText('4 jogos')).toBeTruthy()

    await sortBy('Zerados')
    expect(cards()).toEqual(['Beta', 'Alfa', 'Delta'])
    expect(screen.getByText('3 jogos')).toBeTruthy()
  })

  it('sorts by install state', async () => {
    installFakeApi(LIBRARY)
    await openLibrary()
    await sortBy('Instalação')
    expect(cards()).toEqual(['Beta', 'Delta', 'Alfa'])
  })

  it('marks installed and beaten games, not unknown or missing ones', async () => {
    installFakeApi(LIBRARY)
    await openLibrary()
    await sortBy('Ocultos')
    expect(badges('Alfa')).toEqual([])
    expect(badges('Delta')).toEqual([])
    expect(badges('Beta')).toEqual(['Instalado', 'Zerado'])
    expect(badges('Gama')).toEqual(['Oculto', 'Instalado'])
    // Icons have no text: the state still reaches screen readers.
    expect(screen.getByLabelText('Beta').getAttribute('aria-description')).toBe('Instalado, Zerado')
    expect(screen.getByLabelText('Alfa').getAttribute('aria-description')).toBeNull()
  })

  it('keeps the new badges out of Home, which lists only installed games', async () => {
    installFakeApi([summary(1, 'Tidebound', { installed: true, beated: true })])
    render(<App />)
    await screen.findByText('12h 22m')
    expect(document.querySelector('.game-card__badge')).toBeNull()
  })

  it('keeps the sort when the filters are cleared', async () => {
    installFakeApi(LIBRARY)
    await openLibrary()
    await sortBy('Ocultos')
    press('y')
    await clickText('Jogos zerados')
    await clickText('Limpar filtros')
    await waitFor(() => expect(cards()).toEqual(['Gama', 'Alfa', 'Beta', 'Delta']))
  })
})
