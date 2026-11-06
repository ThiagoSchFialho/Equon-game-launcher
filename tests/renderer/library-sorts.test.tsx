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
  await screen.findByText('12h 22m')
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
    ).toEqual(['Título', 'Recentes', 'Tempo de jogo', 'Origem', 'Instalação', 'Ocultos', 'Zerados'])
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
    press('x')
    await clickText('Jogos zerados')
    await clickText('Limpar filtros')
    await waitFor(() => expect(cards()).toEqual(['Gama', 'Alfa', 'Beta', 'Delta']))
  })
})
