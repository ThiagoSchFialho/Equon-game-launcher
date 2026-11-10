// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { BackgroundActivity, EquonApi, GameSummary } from '../../src/shared/ipc/contract'
import { installFakeApi, summary } from './fake-api'

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
  const element = await screen.findByLabelText(label)
  act(() => element.click())
}
const clickText = async (text: string | RegExp): Promise<void> => {
  const [element] = await screen.findAllByText(text)
  act(() => (element.closest('button') ?? element).click())
}
/** Card titles in grid order. */
const cards = (): string[] =>
  Array.from(document.querySelectorAll('.library__grid .game-card')).map(
    (card) => card.getAttribute('aria-label') ?? ''
  )

const games: GameSummary[] = [
  summary(1, 'Zelda', { origin: 'yuzu', originName: 'Yuzu', playtime: 10 }),
  summary(2, 'Pokémon Red', { installed: false, playtime: 500 }),
  summary(3, 'Celeste', {
    origin: 'steam',
    originName: 'Steam',
    timeLastPlayed: null,
    playtime: 0
  }),
  summary(4, 'Doom', { hidden: true })
]

const openLibrary = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('Início')
  press('e')
  await screen.findByRole('heading', { name: 'Biblioteca' })
}
/** Toolbar field → filters dialog → origin list → back to the filters → closed. */
const pickOrigin = async (field: string, origin: string): Promise<void> => {
  await click(field)
  await screen.findByRole('dialog', { name: 'Filtros' })
  await clickText('Origem')
  await screen.findByRole('dialog', { name: 'Origem' })
  await clickText(origin)
  await screen.findByRole('dialog', { name: 'Filtros' })
  press('Escape')
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

describe('background activity indicator', () => {
  const indicator = (): string | null =>
    document.querySelector('.activity-indicator')?.textContent ?? null

  it('shows what is running with its progress, on every section, then goes away', async () => {
    let send: (activity: BackgroundActivity | null) => void = () => {}
    installFakeApi(games, {
      activity: {
        current: async () => ({ task: 'library', done: 0, total: 0 }),
        onChanged: (listener) => {
          send = listener
          return () => {}
        }
      }
    })
    await openLibrary()
    expect(await screen.findByText('Sincronizando jogos da Steam…')).toBeTruthy()

    act(() => send({ task: 'artwork', done: 12, total: 225 }))
    expect(indicator()).toBe('Baixando artes… 12 de 225')
    // It never takes the focus away from the list.
    expect(document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')).toBe(
      'Celeste'
    )

    press('e')
    await screen.findByRole('heading', { name: 'Conquistas' })
    expect(indicator()).toBe('Baixando artes… 12 de 225')
    press('q')
    press('q')
    await waitFor(() => expect(indicator()).toContain('12 de 225'))

    act(() => send({ task: 'achievements', done: 0, total: 0 }))
    expect(indicator()).toBe('Sincronizando conquistas…')

    act(() => send(null))
    expect(indicator()).toBeNull()
  })
})

describe('background activity on screens without a top bar', () => {
  it('appears in the footer of the game page', async () => {
    installFakeApi(games, {
      activity: {
        current: async () => ({ task: 'achievements', done: 0, total: 0 }),
        onChanged: () => () => {}
      }
    })
    await openLibrary()
    expect(document.querySelector('.top-bar .activity-indicator')).toBeTruthy()
    press('Enter')
    await waitFor(() =>
      expect(document.querySelector('.footer .activity-indicator')?.textContent).toBe(
        'Sincronizando conquistas…'
      )
    )
    expect(document.querySelector('.top-bar')).toBeNull()
  })
})

describe('library organization', () => {
  it('lists non-hidden games alphabetically by default', async () => {
    installFakeApi(games)
    await openLibrary()
    expect(cards()).toEqual(['Celeste', 'Pokémon Red', 'Zelda'])
    expect(screen.getByText('3 jogos')).toBeTruthy()
    expect(screen.getByLabelText('Ordenar: Título')).toBeTruthy()
    expect(screen.getByLabelText('Filtrar: Nenhum')).toBeTruthy()
  })

  it('searches with the on-screen keyboard, ignoring accents', async () => {
    installFakeApi(games)
    await openLibrary()
    await click('Buscar')
    expect(await screen.findByRole('dialog', { name: 'Buscar jogo' })).toBeTruthy()
    type('pokemon')
    press('Enter')
    await waitFor(() => expect(cards()).toEqual(['Pokémon Red']))
    expect(screen.getByText('1 de 3 jogos')).toBeTruthy()
    expect(screen.getByText('pokemon', { selector: '.toolbar-field__text' })).toBeTruthy()
  })

  it('combines origin, sorting and filters, and keeps them across navigation', async () => {
    installFakeApi(games)
    await openLibrary()
    await click('Ordenar: Título')
    await clickText('Tempo de jogo')
    await waitFor(() => expect(cards()).toEqual(['Pokémon Red', 'Zelda', 'Celeste']))

    await pickOrigin('Filtrar: Nenhum', 'Yuzu')
    await waitFor(() => expect(cards()).toEqual(['Zelda']))

    // Home and back: the view stays.
    press('q')
    await screen.findByText('Início')
    press('e')
    await waitFor(() => expect(cards()).toEqual(['Zelda']))
    expect(screen.getByLabelText('Filtrar: 1 ativo')).toBeTruthy()
    expect(screen.getByLabelText('Ordenar: Tempo de jogo')).toBeTruthy()
  })

  it('moves focus to the first game after a sort, a filter or a section change', async () => {
    const focused = (): string | null =>
      document.querySelector('[data-focused="true"]')?.getAttribute('aria-label') ?? null
    installFakeApi(games)
    await openLibrary()
    await waitFor(() => expect(focused()).toBe('Celeste'))

    await click('Ordenar: Título')
    await clickText('Tempo de jogo')
    await waitFor(() => expect(cards()[0]).toBe('Pokémon Red'))
    await waitFor(() => expect(focused()).toBe('Pokémon Red'))

    await pickOrigin('Filtrar: Nenhum', 'Yuzu')
    await waitFor(() => expect(cards()).toEqual(['Zelda']))
    await waitFor(() => expect(focused()).toBe('Zelda'))

    await pickOrigin('Filtrar: 1 ativo', 'Todas')
    await waitFor(() => expect(cards()[0]).toBe('Pokémon Red'))
    await waitFor(() => expect(focused()).toBe('Pokémon Red'))

    // Away from the first game, then to another section and back: first game again.
    press('ArrowRight') // jsdom has no layout: the target is arbitrary, just not this game
    expect(focused()).not.toBe('Pokémon Red')
    press('q')
    await screen.findByText('Início')
    press('e')
    await screen.findByRole('heading', { name: 'Biblioteca' })
    await waitFor(() => expect(focused()).toBe('Pokémon Red'))
  })

  it('adds the filters up, each one on or off in the open dialog (owner decision)', async () => {
    installFakeApi(games)
    await openLibrary()
    await pressPad(Y)
    await screen.findByRole('dialog', { name: 'Filtros' })
    await clickText('Não instalados')
    await waitFor(() => expect(cards()).toEqual(['Pokémon Red']))
    // The dialog stays open and says which ones are on.
    expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy()
    expect(screen.getAllByText('Ativo')).toHaveLength(1)

    // Both install filters: nothing is both.
    await clickText('Instalados')
    await waitFor(() => expect(cards()).toEqual([]))
    expect(screen.getByText('Nenhum jogo corresponde à busca e aos filtros.')).toBeTruthy()

    await clickText('Não instalados')
    await waitFor(() => expect(cards()).toEqual(['Celeste', 'Zelda']))

    // "Ocultos" shows only the hidden games.
    await clickText('Ocultos')
    await waitFor(() => expect(cards()).toEqual(['Doom']))
    expect(screen.getByTitle('Oculto')).toBeTruthy()
    press('Escape')
    await waitFor(() => expect(screen.getByLabelText('Filtrar: 2 ativos')).toBeTruthy())
  })

  it('explains an empty result and clears the filters, keeping the sort', async () => {
    installFakeApi(games)
    await openLibrary()
    await click('Ordenar: Título')
    await clickText('Recentes')
    await click('Buscar')
    type('xyz')
    press('Enter')
    expect(await screen.findByText('Nenhum jogo corresponde à busca e aos filtros.')).toBeTruthy()
    await clickText('Limpar filtros')
    await waitFor(() => expect(cards()).toHaveLength(3))
    expect(screen.getByLabelText('Ordenar: Recentes')).toBeTruthy()
  })

  it('X opens the sorting, Y the filters, and the search has no button', async () => {
    installFakeApi(games)
    await openLibrary()
    const hints = document.querySelector('.footer__hints')?.textContent ?? ''
    expect(hints).toContain('Ordenar')
    expect(hints).toContain('Filtrar')
    expect(hints).not.toContain('Buscar')

    await pressPad(X)
    expect(await screen.findByRole('dialog', { name: 'Ordenar' })).toBeTruthy()
    press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await pressPad(Y)
    expect(await screen.findByRole('dialog', { name: 'Filtros' })).toBeTruthy()
    press('Escape')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // The search is still in the toolbar.
    await click('Buscar')
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('has Filtrar in the toolbar, with the origin as a filter', async () => {
    installFakeApi(games)
    await openLibrary()
    expect(screen.queryByLabelText(/^Origem/)).toBeNull()
    await click('Filtrar: Nenhum')
    await screen.findByRole('dialog', { name: 'Filtros' })
    const labels = [...document.querySelectorAll('.choice__label')].map((l) => l.textContent)
    // No "Limpar filtros" or "Fechar" in the dialog: B closes it (owner decision).
    expect(labels).toEqual(['Origem', 'Ocultos', 'Zerados', 'Instalados', 'Não instalados'])

    // B on the origin list goes back to the filters without changing anything.
    await clickText('Origem')
    await screen.findByRole('dialog', { name: 'Origem' })
    press('Escape')
    await screen.findByRole('dialog', { name: 'Filtros' })
    expect(cards()).toHaveLength(3)

    await clickText('Origem')
    await clickText('Yuzu')
    await screen.findByRole('dialog', { name: 'Filtros' })
    // The dialog says which one is selected, and the filters clear it too.
    expect(await screen.findByText('Yuzu')).toBeTruthy()
    await clickText('Zerados')
    press('Escape')
    await waitFor(() => expect(screen.getByLabelText('Filtrar: 2 ativos')).toBeTruthy())
    // Nothing matches both, so the empty message offers it too; either one clears.
    await clickText('Limpar filtros')
    await waitFor(() => expect(screen.getByLabelText('Filtrar: Nenhum')).toBeTruthy())
    expect(cards()).toHaveLength(3)
  })

  it('opens the filters with the Y key and lists only beaten games', async () => {
    installFakeApi([...games, summary(5, 'Hades', { beated: true })])
    await openLibrary()
    expect(screen.getByLabelText('Limpar filtros').getAttribute('aria-disabled')).toBe('true')
    press('y')
    expect(await screen.findByRole('dialog', { name: 'Filtros' })).toBeTruthy()
    await clickText('Zerados')
    expect(await screen.findByText('Ativo')).toBeTruthy()
    press('Escape')
    await waitFor(() => expect(cards()).toEqual(['Hades']))

    // The toolbar button clears the filters too.
    await click('Limpar filtros')
    await waitFor(() => expect(cards()).toHaveLength(4))
    expect(screen.getByLabelText('Limpar filtros').getAttribute('aria-disabled')).toBe('true')
  })

  it('offers to show hidden games when every game is hidden', async () => {
    installFakeApi([summary(1, 'Doom', { hidden: true })])
    await openLibrary()
    expect(await screen.findByText('Todos os jogos estão ocultos.')).toBeTruthy()
    await clickText('Mostrar ocultos')
    await waitFor(() => expect(cards()).toEqual(['Doom']))
  })
})

describe('manual flags from the options menu', () => {
  it('hides and marks as beaten through the IPC, then reloads', async () => {
    const setFlags = vi.fn<EquonApi['games']['setFlags']>(async () => ({ ok: true, data: null }))
    const list = vi.fn(async () => games)
    installFakeApi(games, { games: { setFlags, list } })
    await openLibrary()
    openMenu()
    expect(await screen.findByRole('dialog', { name: 'Celeste' })).toBeTruthy()
    const before = list.mock.calls.length
    await clickText('Ocultar jogo')
    expect(setFlags).toHaveBeenCalledWith(3, { hidden: true })
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before))

    openMenu()
    await clickText('Marcar como zerado')
    expect(setFlags).toHaveBeenLastCalledWith(3, { beated: true })
  })

  it('offers "Mostrar jogo" for a hidden game', async () => {
    const setFlags = vi.fn<EquonApi['games']['setFlags']>(async () => ({ ok: true, data: null }))
    installFakeApi([summary(1, 'Doom', { hidden: true })], { games: { setFlags } })
    await openLibrary()
    await clickText('Mostrar ocultos')
    await waitFor(() => expect(cards()).toEqual(['Doom']))
    openMenu()
    await clickText('Mostrar jogo')
    expect(setFlags).toHaveBeenCalledWith(1, { hidden: false })
  })
})

describe('home: name under the focused card', () => {
  it('fades out, then shows the new name under the new card, without sliding', async () => {
    installFakeApi([summary(1, 'Alpha'), summary(2, 'Beta')])
    render(<App />)
    const info = (): HTMLElement => document.querySelector('.home__focused-info') as HTMLElement
    // The Home orders by last session: read the order instead of assuming it.
    const onTrack = (): string[] =>
      Array.from(document.querySelectorAll('.home__track .game-card')).map(
        (card) => card.getAttribute('aria-label') ?? ''
      )
    await waitFor(() => expect(onTrack()).toHaveLength(2))
    const [first, second] = onTrack()
    await waitFor(() => expect(info()?.textContent).toContain(first))
    // Opening the screen is not a change: nothing fades.
    expect(info().getAttribute('data-hidden')).toBe('false')
    expect(info().style.getPropertyValue('--index')).toBe('0')

    press('ArrowRight')
    const focused = document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')
    expect(focused).toBe(second)
    // Hidden at once, still the old name and place.
    expect(info().getAttribute('data-hidden')).toBe('true')
    expect(info().textContent).toContain(first)

    await waitFor(() => expect(info().getAttribute('data-hidden')).toBe('false'))
    expect(info().textContent).toContain(second)
    expect(info().style.getPropertyValue('--index')).toBe('1')
  })
})

describe('home rules', () => {
  it('comes back from a game already on its card, without the track travelling', async () => {
    installFakeApi([summary(1, 'A'), summary(2, 'B'), summary(3, 'C')])
    render(<App />)
    await screen.findByText('Início')
    const cardsOnTrack = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('.home__track .game-card'))
    await waitFor(() => expect(cardsOnTrack()).toHaveLength(3))
    const chosen = cardsOnTrack()[2]
    const label = chosen.getAttribute('aria-label')
    act(() => chosen.click())
    await waitFor(() => expect(document.querySelector('.home__track')).toBeNull())

    // The index the carousel has the moment it enters the page.
    const first: (string | undefined)[] = []
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          const carousel = (node as Element).querySelector?.<HTMLElement>('.home__carousel')
          if (carousel) first.push(carousel.style.getPropertyValue('--index'))
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    press('Escape')
    await waitFor(() => expect(document.querySelector('.home__track')).toBeTruthy())
    observer.disconnect()
    expect(first).toEqual(['2'])
    await waitFor(() =>
      expect(document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')).toBe(
        label
      )
    )
  })

  it('shows only installed, non-hidden games, most recent first', async () => {
    installFakeApi([
      summary(1, 'Old', { timeLastPlayed: '2026-10-01T10:00:00Z' }),
      summary(2, 'New', { timeLastPlayed: '2026-11-01T10:00:00Z' }),
      summary(3, 'Missing', { installed: false, timeLastPlayed: '2026-11-02T10:00:00Z' }),
      summary(4, 'Hidden', { hidden: true, timeLastPlayed: '2026-11-02T10:00:00Z' })
    ])
    render(<App />)
    await screen.findByText('Início')
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll('.home__track .game-card')).map((c) =>
          c.getAttribute('aria-label')
        )
      ).toEqual(['New', 'Old'])
    )
  })
})

/** Right click on the first card opens its options menu, like the menu button. */
function openMenu(): void {
  const [card] = Array.from(document.querySelectorAll('.library__grid .game-card'))
  act(() => {
    fireEvent.contextMenu(card)
  })
}

const X = 2
const Y = 3

/** Presses one standard-mapping gamepad button for a few frames. */
async function pressPad(button: number): Promise<void> {
  const pad = (pressed: boolean): Gamepad =>
    ({
      index: 0,
      id: 'test pad',
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({
        pressed: pressed && i === button,
        touched: false,
        value: pressed && i === button ? 1 : 0
      }))
    }) as unknown as Gamepad
  const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  let current = pad(true)
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [current] })
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)))
  current = pad(false)
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
  focus.mockRestore()
}
