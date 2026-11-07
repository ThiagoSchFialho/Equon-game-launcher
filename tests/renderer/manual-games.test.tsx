// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi, IgdbGameFill, ManualGameForm } from '../../src/shared/ipc/contract'
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
    // Within the 10 s of the press, which the play-feedback tests follow to the end.
    expect(await screen.findByLabelText('Abrindo…')).toBeTruthy()
  })

  it('explains launch failures and unavailable states', async () => {
    const missing = summary(1, 'Missing', { installed: false })
    const steam = summary(2, 'Portal 2', {
      origin: 'steam',
      originName: 'Steam',
      installed: false
    })
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

    // Not installed: only in the Library, never on Home.
    press('Escape')
    press('e')
    await click('Missing')
    expect(
      await screen.findByText(
        'Arquivo do jogo não encontrado. Edite o jogo para corrigir o caminho.'
      )
    ).toBeTruthy()

    press('Escape')
    await click('Portal 2')
    expect(await screen.findByText('Jogo não instalado na Steam.')).toBeTruthy()
  })
})

describe('game page', () => {
  it('reads the game again when the library changes, so new art shows up', async () => {
    let emit: () => void = () => {}
    const game = summary(1, 'Hollow Quest')
    const get = vi.fn(async () => details(game))
    installFakeApi([game], {
      games: { get },
      library: {
        onChanged: (listener) => {
          emit = listener
          return () => {}
        }
      }
    })
    render(<App />)
    await screen.findByText('12h 22m')
    press('Enter')
    await screen.findByLabelText('Jogar')
    const callsBefore = get.mock.calls.length
    act(() => emit())
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

describe('add game form', () => {
  const FILL: IgdbGameFill = {
    name: 'Hollow Quest: Official',
    summary: 'A quest in English.',
    releaseDate: '2017-02-24',
    developer: 'Team Quest',
    genres: ['Aventura', 'Indie'],
    requiredAge: '10'
  }
  const igdbFake = (): {
    search: Mock<EquonApi['igdb']['search']>
    game: Mock<EquonApi['igdb']['game']>
    applyArtwork: Mock<EquonApi['igdb']['applyArtwork']>
  } => ({
    search: vi.fn<EquonApi['igdb']['search']>(async () => ({
      ok: true,
      data: [{ id: 7, name: FILL.name, year: 2017, developer: 'Team Quest' }]
    })),
    game: vi.fn<EquonApi['igdb']['game']>(async () => ({ ok: true, data: FILL })),
    applyArtwork: vi.fn<EquonApi['igdb']['applyArtwork']>(async () => ({ ok: true, data: [] }))
  })
  const createOk = (): Mock<EquonApi['games']['create']> =>
    vi.fn<EquonApi['games']['create']>(async () => ({ ok: true, data: { id: 1 } }))

  const openForm = async (): Promise<void> => {
    render(<App />)
    await screen.findByText('12h 22m')
    press('e') // Library
    await click('Adicionar jogo')
    await screen.findByRole('heading', { name: 'Adicionar jogo' })
  }
  const typeTitle = async (title: string): Promise<void> => {
    await click(/Título do jogo/)
    type(title)
    press('Enter')
    await screen.findByText(title, { selector: '.form-row__text' })
  }
  const pickFile = async (name: string): Promise<void> => {
    await click(/Executável/)
    await clickText(name)
  }

  it('submits with Start, like the button, and says so in the footer', async () => {
    const igdb = igdbFake()
    installFakeApi([summary(1, 'A')], { igdb })
    await openForm()
    const hints = [...document.querySelectorAll('.footer .hint')].map((hint) => hint.textContent)
    expect(hints).toEqual(['Salvar', 'ASelecionar', 'BVoltar'])

    // Nothing typed yet: the same errors as the button.
    press('m')
    expect(await screen.findAllByText('Campo obrigatório.')).toHaveLength(2)

    // Not while the keyboard is open: it keeps the key for itself (here, a typed letter).
    await click(/Título do jogo/)
    press('m')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(igdb.search).not.toHaveBeenCalled()
  })

  it('asks only for the title, executable, playtime and arguments', async () => {
    installFakeApi([summary(1, 'A')])
    await openForm()
    expect(
      [...document.querySelectorAll('.form-row')].map((r) => r.getAttribute('aria-label'))
    ).toEqual(['Título do jogo', 'Executável', 'Tempo de jogo', 'Argumentos'])
    expect(screen.queryByText('Selecionar imagem')).toBeNull()
    expect(screen.queryByLabelText('Preencher com IGDB')).toBeNull()
  })

  it('fills the form with the keyboard and the file browser, then saves as a local game', async () => {
    const create = createOk()
    installFakeApi([summary(1, 'Hollow Quest')], {
      games: { create },
      igdb: { search: async () => ({ ok: true, data: [] }) },
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
    await openForm()

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

    await click(/Adicionar jogo/)
    await clickText('Salvar sem dados do IGDB')
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toEqual<ManualGameForm>({
      title: 'Hollow Quest',
      description: null,
      developer: null,
      releaseDate: null,
      requiredAge: null,
      playtimeOffset: 90,
      origin: 'manual',
      executablePath: 'C:\\Games\\hq.exe',
      romPath: null,
      arguments: [],
      workingDirectory: null
    })
    // Opens the new game.
    expect(await screen.findByText('Sobre o jogo')).toBeTruthy()
  })

  it('asks IGDB only after the required fields are there', async () => {
    const igdb = igdbFake()
    const create = createOk()
    installFakeApi([summary(1, 'A')], { games: { create }, igdb })
    await openForm()
    await click(/Adicionar jogo/)
    expect(await screen.findAllByText('Campo obrigatório.')).toHaveLength(2)
    expect(igdb.search).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('shows on its row an error from main, keeping what was typed', async () => {
    const create = vi.fn<EquonApi['games']['create']>(async () => ({
      ok: false,
      error: { code: 'missing', field: 'executablePath' }
    }))
    installFakeApi([summary(1, 'A')], {
      games: { create },
      igdb: igdbFake(),
      files: { list: listing('C:\\Games', 'hq.exe') }
    })
    await openForm()
    await typeTitle('Hollow')
    await pickFile('hq.exe')
    await click(/Adicionar jogo/)
    await clickText(FILL.name)
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Hollow', { selector: '.form-row__text' })).toBeTruthy()
    expect(document.querySelector('.form-row__error')).toBeTruthy()
  })

  it('asks before discarding changes', async () => {
    installFakeApi([summary(1, 'A')])
    await openForm()
    await typeTitle('Novo')
    press('Escape')
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
    await clickText('Descartar')
    expect(await screen.findByText('1 jogo')).toBeTruthy()
  })

  it('confirms the game on IGDB when saving, and uses its data and art', async () => {
    const create = createOk()
    const igdb = igdbFake()
    installFakeApi([summary(1, 'A')], {
      games: { create },
      igdb,
      files: { list: listing('C:\\Games', 'hq.exe') }
    })
    await openForm()
    await typeTitle('hollow')
    await pickFile('hq.exe')
    await click('Argumentos')
    type('-w')
    press('Enter')
    await click(/Adicionar jogo/)

    await waitFor(() => expect(igdb.search).toHaveBeenCalledWith('hollow'))
    expect(await screen.findByText('2017 · Team Quest')).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
    await clickText(FILL.name)

    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({
      title: FILL.name,
      description: 'A quest in English.',
      developer: 'Team Quest',
      releaseDate: '2017-02-24',
      requiredAge: '10',
      origin: 'manual',
      executablePath: 'C:\\Games\\hq.exe',
      arguments: ['-w'],
      genres: ['Aventura', 'Indie']
    })
    await waitFor(() => expect(igdb.applyArtwork).toHaveBeenCalledWith(1, 7))
    expect(await screen.findByText('Sobre o jogo')).toBeTruthy()
  })

  it('goes back to the form when the IGDB choice is closed, saving nothing', async () => {
    const create = createOk()
    installFakeApi([summary(1, 'A')], {
      games: { create },
      igdb: igdbFake(),
      files: { list: listing('C:\\Games', 'hq.exe') }
    })
    await openForm()
    await typeTitle('Hollow')
    await pickFile('hq.exe')
    await click(/Adicionar jogo/)
    await clickText('Fechar')
    expect(await screen.findByText('Hollow', { selector: '.form-row__text' })).toBeTruthy()
    expect(create).not.toHaveBeenCalled()
  })

  it('can save without IGDB even when it has results', async () => {
    const create = createOk()
    const igdb = igdbFake()
    installFakeApi([summary(1, 'A')], {
      games: { create },
      igdb,
      files: { list: listing('C:\\Games', 'hq.exe') }
    })
    await openForm()
    await typeTitle('Hollow')
    await pickFile('hq.exe')
    await click(/Adicionar jogo/)
    await clickText('Salvar sem dados do IGDB')
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({ title: 'Hollow', description: null })
    expect(create.mock.calls[0][0]).not.toHaveProperty('genres')
    expect(igdb.applyArtwork).not.toHaveBeenCalled()
  })

  it('searches another name when nothing was found', async () => {
    const igdb = igdbFake()
    igdb.search.mockResolvedValueOnce({ ok: true, data: [] })
    installFakeApi([summary(1, 'A')], { igdb, files: { list: listing('C:\\Games', 'hq.exe') } })
    await openForm()
    await typeTitle('xyz')
    await pickFile('hq.exe')
    await click(/Adicionar jogo/)
    expect(await screen.findByText('Nenhum jogo encontrado para "xyz".')).toBeTruthy()
    await clickText('Buscar outro nome')
    await screen.findByRole('dialog', { name: 'Nome do jogo no IGDB' })
    press('2')
    press('Enter')
    await waitFor(() => expect(igdb.search).toHaveBeenLastCalledWith('xyz2'))
  })

  it.each([
    ['not-configured', 'Configure o Client ID e o Client Secret do IGDB em Configurações.'],
    ['invalid-key', 'As credenciais do IGDB são inválidas. Confira em Configurações.'],
    ['network', 'Sem conexão com o IGDB. Tente mais tarde.'],
    ['unavailable', 'O IGDB está indisponível agora. Tente mais tarde.']
  ])('saves and explains when IGDB fails (%s)', async (code, message) => {
    const create = createOk()
    const applyArtwork = vi.fn<EquonApi['igdb']['applyArtwork']>(async () => ({
      ok: true,
      data: []
    }))
    installFakeApi([summary(1, 'A')], {
      games: { create },
      igdb: { search: async () => ({ ok: false, error: { code } }), applyArtwork },
      files: { list: listing('C:\\Games', 'hq.exe') }
    })
    await openForm()
    await typeTitle('Hollow')
    await pickFile('hq.exe')
    await click(/Adicionar jogo/)

    expect(await screen.findByRole('dialog', { name: 'Jogo salvo sem dados do IGDB' })).toBeTruthy()
    expect(screen.getByText(`${message} Você pode completar os dados em Editar jogo.`)).toBeTruthy()
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0][0]).toMatchObject({ title: 'Hollow', description: null })
    expect(applyArtwork).not.toHaveBeenCalled()

    await clickText('Entendi')
    expect(await screen.findByText('Sobre o jogo')).toBeTruthy()
  })

  it('also saves when the chosen game cannot be read', async () => {
    const create = createOk()
    const igdb = igdbFake()
    igdb.game.mockResolvedValue({ ok: false, error: { code: 'network' } })
    installFakeApi([summary(1, 'A')], {
      games: { create },
      igdb,
      files: { list: listing('C:\\Games', 'hq.exe') }
    })
    await openForm()
    await typeTitle('Hollow')
    await pickFile('hq.exe')
    await click(/Adicionar jogo/)
    await clickText(FILL.name)
    expect(await screen.findByRole('dialog', { name: 'Jogo salvo sem dados do IGDB' })).toBeTruthy()
    expect(create).toHaveBeenCalledOnce()
    expect(igdb.applyArtwork).not.toHaveBeenCalled()
  })

  it('turns into a Yuzu game when a ROM is chosen, and back with an executable', async () => {
    const create = createOk()
    const kinds: string[] = []
    let file = 'Zelda.nsp'
    installFakeApi([summary(1, 'A')], {
      games: { create },
      igdb: { search: async () => ({ ok: true, data: [] }) },
      emulators: { list: async () => [yuzu('C:\\Yuzu\\yuzu.exe')] },
      files: {
        list: (path, kind) => {
          kinds.push(kind)
          return listing('D:\\Switch', file)(path, kind)
        }
      }
    })
    await openForm()
    await typeTitle('Zelda')
    await pickFile('Zelda.nsp')
    expect(kinds).toContain('game')
    expect(
      await screen.findByText('Será iniciado com: yuzu.exe -f -g "D:\\Switch\\Zelda.nsp"')
    ).toBeTruthy()
    expect(screen.queryByLabelText('Argumentos')).toBeNull()

    file = 'jogo.exe'
    await pickFile('jogo.exe')
    expect(await screen.findByLabelText('Argumentos')).toBeTruthy()
    expect(screen.queryByText(/Será iniciado com/)).toBeNull()

    file = 'Zelda.nsp'
    await pickFile('Zelda.nsp')
    await click(/Adicionar jogo/)
    await clickText('Salvar sem dados do IGDB')
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({
      origin: 'yuzu',
      executablePath: '',
      romPath: 'D:\\Switch\\Zelda.nsp',
      arguments: [],
      workingDirectory: null
    })
  })

  it('offers only executables and shortcuts while no emulator is configured', async () => {
    const kinds: string[] = []
    installFakeApi([summary(1, 'A')], {
      files: {
        list: (path, kind) => {
          kinds.push(kind)
          return listing('C:\\Games', 'hq.exe')(path, kind)
        }
      }
    })
    await openForm()
    await pickFile('hq.exe')
    expect(kinds).toEqual(expect.arrayContaining(['executable']))
    expect(kinds).not.toContain('game')
  })

  it('hides arguments for .url shortcuts', async () => {
    const create = createOk()
    installFakeApi([summary(1, 'A')], {
      games: { create },
      igdb: { search: async () => ({ ok: true, data: [] }) },
      files: { list: listing('C:\\Atalhos', 'Fortnite.url') }
    })
    await openForm()
    await typeTitle('Fortnite')
    await pickFile('Fortnite.url')
    expect(await screen.findByText(/Atalhos .url abrem pela loja/)).toBeTruthy()
    expect(screen.queryByLabelText('Argumentos')).toBeNull()
    await click(/Adicionar jogo/)
    await clickText('Salvar sem dados do IGDB')
    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create.mock.calls[0][0]).toMatchObject({
      executablePath: 'C:\\Atalhos\\Fortnite.url',
      romPath: null,
      arguments: [],
      workingDirectory: null
    })
  })
})

describe('edit game form', () => {
  const editable: Awaited<ReturnType<EquonApi['games']['getEditable']>> = {
    id: 1,
    form: {
      title: 'Mine',
      description: 'My own words.',
      developer: null,
      releaseDate: null,
      requiredAge: null,
      playtimeOffset: 0,
      origin: 'manual',
      executablePath: 'C:\\Games\\m.exe',
      romPath: null,
      arguments: [],
      workingDirectory: null
    }
  }
  const openEdit = async (): Promise<void> => {
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    await clickText('Editar jogo')
    await screen.findByRole('heading', { name: 'Editar jogo' })
  }

  it('offers every field and IGDB', async () => {
    installFakeApi([summary(1, 'Mine')], { games: { getEditable: async () => editable } })
    await openEdit()
    for (const label of [
      'Descrição',
      'Desenvolvedor',
      'Data de lançamento',
      'Origem',
      'Classificação indicativa',
      'Pasta de trabalho',
      'Preencher com IGDB'
    ]) {
      expect(await screen.findByLabelText(label)).toBeTruthy()
    }
    // Art has its own screen.
    expect(screen.queryByText('Selecionar imagem')).toBeNull()
  })

  it('only fills what is empty from IGDB', async () => {
    const update = vi.fn<EquonApi['games']['update']>(async () => ({ ok: true, data: { id: 1 } }))
    const applyArtwork = vi.fn<EquonApi['igdb']['applyArtwork']>(async () => ({
      ok: true,
      data: []
    }))
    installFakeApi([summary(1, 'Mine')], {
      igdb: {
        search: async () => ({
          ok: true,
          data: [{ id: 7, name: 'Official', year: 2017, developer: 'Team Quest' }]
        }),
        game: async () => ({
          ok: true,
          data: {
            name: 'Official',
            summary: 'A quest in English.',
            releaseDate: '2017-02-24',
            developer: 'Team Quest',
            genres: ['Indie'],
            requiredAge: '10'
          }
        }),
        applyArtwork
      },
      games: { update, getEditable: async () => editable }
    })
    await openEdit()
    await click('Preencher com IGDB')
    await clickText('Official')
    expect(await screen.findByText('Team Quest')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
    await click(/Adicionar jogo/)
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0][1]).toMatchObject({
      title: 'Mine',
      description: 'My own words.',
      developer: 'Team Quest',
      releaseDate: '2017-02-24',
      genres: ['Indie']
    })
    await waitFor(() => expect(applyArtwork).toHaveBeenCalledWith(1, 7))
  })

  it('saves with Start', async () => {
    const update = vi.fn<EquonApi['games']['update']>(async () => ({ ok: true, data: { id: 1 } }))
    installFakeApi([summary(1, 'Mine')], { games: { update, getEditable: async () => editable } })
    await openEdit()
    press('m')
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0][1]).toMatchObject({ title: 'Mine', description: 'My own words.' })
  })

  it('keeps an IGDB failure on screen, changing nothing', async () => {
    const update = vi.fn<EquonApi['games']['update']>(async () => ({ ok: true, data: { id: 1 } }))
    installFakeApi([summary(1, 'Mine')], {
      igdb: { search: async () => ({ ok: false, error: { code: 'network' } }) },
      games: { update, getEditable: async () => editable }
    })
    await openEdit()
    await click('Preencher com IGDB')
    expect(await screen.findByText('Sem conexão com o IGDB. Tente mais tarde.')).toBeTruthy()
    expect(update).not.toHaveBeenCalled()
  })

  describe('of a Steam game', () => {
    const steamEditable: typeof editable = {
      id: 1,
      form: {
        ...editable!.form,
        title: 'Portal 2',
        origin: 'steam',
        executablePath: '',
        description: 'From the store.'
      }
    }
    const steamGame = summary(1, 'Portal 2', { origin: 'steam', originName: 'Steam' })
    const openSteamEdit = async (): Promise<void> => {
      render(<App />)
      await screen.findByText('12h 22m')
      press('m')
      await clickText('Editar jogo')
      await screen.findByRole('heading', { name: /Editar jogo/ })
    }

    it('offers only the details, showing the name it does not edit', async () => {
      installFakeApi([steamGame], { games: { getEditable: async () => steamEditable } })
      await openSteamEdit()
      expect(screen.getByRole('heading', { name: /Editar jogo/ }).textContent).toContain('Portal 2')
      for (const label of [
        'Descrição',
        'Desenvolvedor',
        'Data de lançamento',
        'Classificação indicativa',
        'Preencher com IGDB'
      ]) {
        expect(await screen.findByLabelText(label)).toBeTruthy()
      }
      for (const label of [
        'Título do jogo',
        'ROM',
        'Executável',
        'Tempo de jogo',
        'Origem',
        'Argumentos',
        'Pasta de trabalho'
      ]) {
        expect(screen.queryByLabelText(label)).toBeNull()
      }
    })

    it('saves with Start too', async () => {
      const updateSteam = vi.fn<EquonApi['games']['updateSteam']>(async () => ({
        ok: true,
        data: { id: 1 }
      }))
      installFakeApi([steamGame], {
        games: { updateSteam, getEditable: async () => steamEditable }
      })
      await openSteamEdit()
      press('m')
      await waitFor(() => expect(updateSteam).toHaveBeenCalledOnce())
      expect(updateSteam.mock.calls[0][1]).toMatchObject({ description: 'From the store.' })
    })

    it('saves the details only, filling from IGDB without its art', async () => {
      const update = vi.fn<EquonApi['games']['update']>()
      const updateSteam = vi.fn<EquonApi['games']['updateSteam']>(async () => ({
        ok: true,
        data: { id: 1 }
      }))
      const applyArtwork = vi.fn<EquonApi['igdb']['applyArtwork']>()
      installFakeApi([steamGame], {
        igdb: {
          search: async () => ({
            ok: true,
            data: [{ id: 7, name: 'Portal 2 (IGDB)', year: 2011, developer: 'Valve' }]
          }),
          game: async () => ({
            ok: true,
            data: {
              name: 'Portal 2',
              summary: 'Replaced? No.',
              releaseDate: '2011-04-18',
              developer: 'Valve',
              genres: ['Puzzle'],
              requiredAge: '10'
            }
          }),
          applyArtwork
        },
        games: { update, updateSteam, getEditable: async () => steamEditable }
      })
      await openSteamEdit()
      await click('Preencher com IGDB')
      await clickText('Portal 2 (IGDB)')
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(await screen.findByText('Valve')).toBeTruthy()
      // The submit button keeps its label for every form.
      await click(/Adicionar jogo/)
      await waitFor(() => expect(updateSteam).toHaveBeenCalledOnce())
      expect(updateSteam.mock.calls[0]).toEqual([
        1,
        {
          description: 'From the store.',
          developer: 'Valve',
          releaseDate: '2011-04-18',
          requiredAge: '10',
          genres: ['Puzzle']
        }
      ])
      expect(update).not.toHaveBeenCalled()
      expect(applyArtwork).not.toHaveBeenCalled()
    })
  })

  it('warns when Yuzu is not configured', async () => {
    installFakeApi([summary(1, 'Mine')], { games: { getEditable: async () => editable } })
    await openEdit()
    await click('Origem')
    await clickText('Yuzu')
    expect(
      await screen.findByText('Yuzu ainda não foi configurado. Use Configurações › Emuladores.')
    ).toBeTruthy()
    expect(screen.queryByLabelText('Argumentos')).toBeNull()
  })
})

describe('emulators in Settings', () => {
  it('configures, changes and removes the Yuzu executable', async () => {
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
    // The Library has no emulator button any more; the tab lives in Settings.
    await screen.findByText('1 jogo')
    expect(screen.queryByLabelText('Emuladores')).toBeNull()
    await click('Menu do sistema')
    await clickText('Configurações')
    await clickText('Emuladores')
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

  it('offers edit but no remove for Steam games', async () => {
    installFakeApi([summary(1, 'Portal 2', { origin: 'steam', originName: 'Steam' })])
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    await screen.findByRole('dialog', { name: 'Portal 2' })
    expect(screen.getByText('Editar jogo')).toBeTruthy()
    expect(screen.queryByText('Remover jogo')).toBeNull()
  })
})
