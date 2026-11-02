// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi, ManualGameForm } from '../../src/shared/ipc/contract'
import { details, installFakeApi, summary, yuzu } from './fake-api'

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
  const element = await screen.findByText(text)
  act(() => (element.closest('button') ?? element).click())
}

describe('play from game details', () => {
  it('launches, shows the running state and refreshes when the game stops', async () => {
    let emit: (ids: number[]) => void = () => {}
    const game = summary(1, 'Hollow Quest')
    const get = vi.fn(async () => details(game))
    const launch = vi.fn<EquonApi['games']['launch']>(async () => ({ ok: true, data: null }))
    installFakeApi([game], {
      games: {
        get,
        launch,
        onRunningChanged: (listener) => {
          emit = listener
          return () => {}
        }
      }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('Enter')
    await click('Jogar')
    expect(launch).toHaveBeenCalledWith(1)

    act(() => emit([1]))
    expect((await screen.findByLabelText('Em execução')).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('O tempo desta sessão será somado quando o jogo fechar.')).toBeTruthy()

    const callsBefore = get.mock.calls.length
    act(() => emit([]))
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(callsBefore))
    expect(await screen.findByLabelText('Jogar')).toBeTruthy()
  })

  it('explains launch failures and unavailable states', async () => {
    const missing = summary(1, 'Missing', { installed: false })
    const steam = summary(2, 'Portal 2', { origin: 'steam', originName: 'Steam' })
    const ok = summary(3, 'Fine')
    installFakeApi([missing, steam, ok], {
      games: { launch: async () => ({ ok: false, error: { code: 'start-failed' } }) }
    })
    render(<App />)
    await screen.findByText('12h 22m')

    await click('Fine')
    await click('Jogar')
    expect(
      await screen.findByText(
        'Não foi possível iniciar o jogo. Verifique o executável e os argumentos.'
      )
    ).toBeTruthy()

    press('Escape')
    await click('Missing')
    expect(
      await screen.findByText(
        'Arquivo do jogo não encontrado. Edite o jogo para corrigir o caminho.'
      )
    ).toBeTruthy()

    press('Escape')
    await click('Portal 2')
    expect(
      await screen.findByText('Iniciar jogos da Steam estará disponível em breve.')
    ).toBeTruthy()
  })
})

describe('add game form', () => {
  it('fills the form with the keyboard and the file browser, then saves', async () => {
    const create = vi.fn<EquonApi['games']['create']>(async () => ({ ok: true, data: { id: 1 } }))
    installFakeApi([summary(1, 'Hollow Quest')], {
      games: { create },
      files: {
        list: async (path) => ({
          ok: true,
          data: path
            ? {
                path,
                parent: null,
                entries: [{ name: 'hq.exe', path: 'C:\\Games\\hq.exe', type: 'file' }],
                truncated: false
              }
            : {
                path: null,
                parent: null,
                entries: [{ name: 'C:\\', path: 'C:\\', type: 'directory' }],
                truncated: false
              }
        })
      }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('e') // Library
    await click('Adicionar jogo')
    expect(await screen.findByRole('heading', { name: 'Adicionar jogo' })).toBeTruthy()

    // Title through the on-screen keyboard, typed on a physical keyboard.
    await click(/Título do jogo/)
    expect(await screen.findByRole('dialog', { name: 'Título do jogo' })).toBeTruthy()
    type('Hollow Quest')
    press('Enter')
    expect(await screen.findByText('Hollow Quest', { selector: '.form-row__text' })).toBeTruthy()

    // Playtime: digits only.
    await click('Tempo de jogo')
    type('90x')
    expect(screen.getByText('Use apenas números.')).toBeTruthy()
    press('Enter')
    expect(await screen.findByText('90 min')).toBeTruthy()

    // Executable through the controller-friendly file browser.
    await click('Executável')
    await clickText('C:\\')
    await clickText('hq.exe')
    expect(await screen.findByText('C:\\Games\\hq.exe')).toBeTruthy()

    // Age rating select.
    await click('Classificação indicativa')
    await clickText('12 anos')

    await click(/Adicionar jogo/)
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toEqual<ManualGameForm>({
      title: 'Hollow Quest',
      description: null,
      developer: null,
      releaseDate: null,
      requiredAge: '12',
      playtimeOffset: 90,
      origin: 'manual',
      executablePath: 'C:\\Games\\hq.exe',
      romPath: null,
      arguments: [],
      workingDirectory: null,
      backgroundPath: null
    })
    // Opens the new game.
    expect(await screen.findByText('Sobre o jogo')).toBeTruthy()
  })

  it('shows required fields locally and main errors on their row', async () => {
    const create = vi.fn<EquonApi['games']['create']>(async () => ({
      ok: false,
      error: { code: 'missing', field: 'executablePath' }
    }))
    installFakeApi([], { games: { create } })
    render(<App />)
    await screen.findByText('Nenhum jogo para mostrar ainda.')
    press('Enter') // empty Home → Library
    const [addButton] = await screen.findAllByLabelText('Adicionar jogo')
    act(() => addButton.click())
    await screen.findByRole('heading', { name: 'Adicionar jogo' })

    await click(/Adicionar jogo/)
    expect(await screen.findAllByText('Campo obrigatório.')).toHaveLength(2)
    expect(create).not.toHaveBeenCalled()

    await click(/Título do jogo/)
    type('X')
    press('Enter')
    await click('Executável')
    // Type a path directly is not possible; use the native picker fallback.
    expect(await screen.findByText('Usar janela do Windows')).toBeTruthy()
    press('Escape')
  })

  it('asks before discarding changes', async () => {
    installFakeApi([summary(1, 'A')])
    render(<App />)
    await screen.findByText('12h 22m')
    press('e')
    await click('Adicionar jogo')
    await click(/Título do jogo/)
    type('Novo')
    press('Enter')
    press('Escape')
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
    await clickText('Descartar')
    expect(await screen.findByText('1 jogo')).toBeTruthy()
  })

  it('asks only for the ROM when the origin is Yuzu', async () => {
    const create = vi.fn<EquonApi['games']['create']>(async () => ({ ok: true, data: { id: 1 } }))
    installFakeApi([summary(1, 'A')], {
      games: { create },
      emulators: { list: async () => [yuzu('C:\\Yuzu\\yuzu.exe')] },
      files: { list: listing('D:\\Switch', 'Zelda.nsp') }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('e')
    await click('Adicionar jogo')
    await click(/Título do jogo/)
    type('Zelda')
    press('Enter')
    await click('Origem')
    await clickText('Yuzu')
    expect(screen.queryByLabelText(/Executável/)).toBeNull()
    expect(screen.queryByLabelText('Argumentos')).toBeNull()
    await click(/ROM/)
    await clickText('Zelda.nsp')
    expect(
      await screen.findByText('Será iniciado com: yuzu.exe -f -g "D:\\Switch\\Zelda.nsp"')
    ).toBeTruthy()
    await click(/Adicionar jogo/)
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({
      origin: 'yuzu',
      executablePath: '',
      romPath: 'D:\\Switch\\Zelda.nsp',
      arguments: [],
      workingDirectory: null
    })
  })

  it('warns when Yuzu is not configured', async () => {
    installFakeApi([summary(1, 'A')])
    render(<App />)
    await screen.findByText('12h 22m')
    press('e')
    await click('Adicionar jogo')
    await click('Origem')
    await clickText('Yuzu')
    expect(
      await screen.findByText('Yuzu ainda não foi configurado. Use “Emuladores” na Biblioteca.')
    ).toBeTruthy()
  })

  it('hides arguments and folder for .url shortcuts', async () => {
    const create = vi.fn<EquonApi['games']['create']>(async () => ({ ok: true, data: { id: 1 } }))
    installFakeApi([summary(1, 'A')], {
      games: { create },
      files: { list: listing('C:\\Atalhos', 'Fortnite.url') }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('e')
    await click('Adicionar jogo')
    await click(/Título do jogo/)
    type('Fortnite')
    press('Enter')
    await click(/Executável/)
    await clickText('Fortnite.url')
    expect(await screen.findByText(/Atalhos .url abrem pela loja/)).toBeTruthy()
    expect(screen.queryByLabelText('Argumentos')).toBeNull()
    expect(screen.queryByLabelText('Pasta de trabalho')).toBeNull()
    await click(/Adicionar jogo/)
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({
      executablePath: 'C:\\Atalhos\\Fortnite.url',
      romPath: null,
      arguments: [],
      workingDirectory: null
    })
  })
})

describe('add emulator', () => {
  it('configures, changes and removes the Yuzu executable from the Library', async () => {
    let current: string | null = null
    const set = vi.fn<EquonApi['emulators']['set']>(async (_key, path) => {
      current = path
      return { ok: true, data: yuzu(path) }
    })
    const remove = vi.fn<EquonApi['emulators']['remove']>(async () => {
      current = null
      return { ok: true, data: null }
    })
    installFakeApi([summary(1, 'A')], {
      emulators: { list: async () => [yuzu(current)], set, remove },
      files: { list: listing('C:\\Yuzu', 'yuzu.exe') }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('e')
    await click('Emuladores')
    expect(await screen.findByText('Não configurado — escolha o yuzu.exe')).toBeTruthy()
    await click('Yuzu')
    await clickText('yuzu.exe')
    expect(set).toHaveBeenCalledWith('yuzu', 'C:\\Yuzu\\yuzu.exe')
    expect(await screen.findByText('C:\\Yuzu\\yuzu.exe')).toBeTruthy()

    await click('Yuzu')
    expect(await screen.findByText('A troca vale para todos os jogos deste emulador.')).toBeTruthy()
    await clickText('Remover emulador')
    expect(remove).toHaveBeenCalledWith('yuzu')
    expect(await screen.findByText('Não configurado — escolha o yuzu.exe')).toBeTruthy()

    press('Escape')
    expect(await screen.findByText('1 jogo')).toBeTruthy()
  })
})

/** A file-browser folder with one compatible file. */
function listing(path: string, name: string): EquonApi['files']['list'] {
  return async () => ({
    ok: true,
    data: {
      path,
      parent: null,
      entries: [{ name, path: `${path}\\${name}`, type: 'file' }],
      truncated: false
    }
  })
}

describe('on-screen keyboard controller actions', () => {
  it('erases, adds spaces, toggles capitals and finishes', async () => {
    installFakeApi([summary(1, 'A')])
    render(<App />)
    await screen.findByText('12h 22m')
    press('e')
    await click('Adicionar jogo')
    await click(/Título do jogo/)
    const dialog = await screen.findByRole('dialog', { name: 'Título do jogo' })
    await clickText('q')
    await click('Maiúsculas')
    await clickText('W') // capitals on
    await click('Espaço')
    await click('Apagar')
    expect(dialog.querySelector('.keyboard__input')?.textContent).toBe('qW')
    await clickText('Pronto')
    expect(await screen.findByText('qW', { selector: '.form-row__text' })).toBeTruthy()
  })
})

describe('remove game', () => {
  it('confirms before removing from the options menu', async () => {
    const remove = vi.fn<EquonApi['games']['remove']>(async () => ({ ok: true, data: null }))
    installFakeApi([summary(1, 'Hollow Quest')], { games: { remove } })
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    await clickText('Remover jogo')
    expect(await screen.findByRole('dialog', { name: 'Remover "Hollow Quest"?' })).toBeTruthy()
    await clickText('Remover')
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1))
  })

  it('offers no edit or remove for Steam games', async () => {
    installFakeApi([summary(1, 'Portal 2', { origin: 'steam', originName: 'Steam' })])
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    await screen.findByRole('dialog', { name: 'Portal 2' })
    expect(screen.queryByText('Editar jogo')).toBeNull()
    expect(screen.queryByText('Remover jogo')).toBeNull()
  })
})
