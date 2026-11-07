// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import App from '../../src/renderer/src/App'
import type { EquonApi, GameSummary } from '../../src/shared/ipc/contract'
import { details, installFakeApi, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const click = async (label: string | RegExp): Promise<void> => {
  const element = await screen.findByLabelText(label)
  act(() => element.click())
}
const clickText = async (text: string | RegExp): Promise<void> => {
  const element = await screen.findByText(text)
  act(() => (element.closest('button') ?? element).click())
}

const steam = (extra: Partial<GameSummary> = {}): GameSummary =>
  summary(1, 'Tidebound', { origin: 'steam', originName: 'Steam', ...extra })

const open = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('12h 22m')
  press('m')
  await clickText('Editar artes')
  await screen.findByRole('heading', { name: /Editar artes/ })
}

const previewOf = (kind: string): HTMLElement =>
  document.querySelector(`.art-editor__preview[data-kind="${kind}"]`) as HTMLElement
const panelOf = (name: string): HTMLElement =>
  screen.getByRole('heading', { name }).closest('section') as HTMLElement

const pickFile: EquonApi['files']['list'] = async () => ({
  ok: true,
  data: {
    path: 'C:\\Art',
    parent: null,
    entries: [{ name: 'art.png', path: 'C:\\Art\\art.png', type: 'file' }],
    truncated: false
  }
})

describe('options menu', () => {
  it('offers Editar artes for any game, instead of the two searches', async () => {
    installFakeApi([steam()])
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    expect(await screen.findByText('Editar artes')).toBeTruthy()
    expect(screen.queryByText('Buscar artes no SteamGridDB')).toBeNull()
    expect(screen.queryByText('Buscar artes no IGDB')).toBeNull()
  })

  it('opens from the game page too, and comes back to it', async () => {
    const game = summary(1, 'Tidebound')
    installFakeApi([game], { games: { get: async () => details(game) } })
    render(<App />)
    await screen.findByText('12h 22m')
    press('Enter')
    await screen.findByLabelText('Jogar')
    press('m')
    await clickText('Editar artes')
    await screen.findByRole('heading', { name: /Editar artes/ })
    press('Escape')
    expect(await screen.findByLabelText('Jogar')).toBeTruthy()
  })
})

describe('Editar artes', () => {
  it('shows each kind with the sources it has', async () => {
    installFakeApi([steam()])
    await open()
    const buttons = (name: string): string[] =>
      within(panelOf(name))
        .getAllByRole('button')
        .map((button) => button.textContent ?? '')
    const grid = 'Selecionar imagem do SteamGridDB'
    const file = 'Selecionar imagem do PC'
    const igdb = 'Imagem do IGDB'
    const remove = 'Remover imagem'
    expect(buttons('Capa vertical')).toEqual([igdb, grid, file, remove])
    expect(buttons('Capa quadrada')).toEqual([grid, file, remove])
    expect(buttons('Logo')).toEqual([igdb, grid, file, remove])
    expect(buttons('Imagem de fundo')).toEqual([igdb, 'Imagens da Steam', file, remove])
    expect(screen.queryByRole('heading', { name: 'Cabeçalho' })).toBeNull()
  })

  it('previews what the game has, and has nothing to remove otherwise', async () => {
    installFakeApi([steam({ artwork: ['logo'], artworkVersion: 'v1' })])
    await open()
    expect(previewOf('logo').querySelector('img')?.getAttribute('src')).toBe(
      'equon-art://game/1/logo?v=v1'
    )
    expect(previewOf('background').querySelector('img')).toBeNull()
    expect(screen.getByLabelText('Remover imagem: Logo').getAttribute('aria-disabled')).toBe(
      'false'
    )
    expect(
      screen.getByLabelText('Remover imagem: Imagem de fundo').getAttribute('aria-disabled')
    ).toBe('true')
  })

  it('uses a file only after Salvar, removing what was asked', async () => {
    const fromFile = vi.fn<EquonApi['artworkEdit']['fromFile']>(async () => ({
      ok: true,
      data: { version: 5 }
    }))
    const save = vi.fn<EquonApi['artworkEdit']['save']>(async () => ({ ok: true, data: null }))
    installFakeApi([steam({ artwork: ['logo'] })], {
      artworkEdit: { fromFile, save },
      files: { list: pickFile }
    })
    await open()

    await click('Selecionar imagem do PC: Imagem de fundo')
    await clickText('art.png')
    await waitFor(() => expect(fromFile).toHaveBeenCalledWith(1, 'background', 'C:\\Art\\art.png'))
    await waitFor(() =>
      expect(previewOf('background').querySelector('img')?.getAttribute('src')).toBe(
        'equon-art://draft/background?v=5'
      )
    )
    await click('Remover imagem: Logo')
    expect(previewOf('logo').querySelector('img')).toBeNull()
    expect(screen.getByText('Será removida ao salvar.')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()

    await click('Salvar')
    await waitFor(() => expect(save).toHaveBeenCalledWith(1, ['logo']))
    // Back on Home.
    expect(await screen.findByText('12h 22m')).toBeTruthy()
  })

  it('saves with Start, and says so in the footer', async () => {
    const save = vi.fn<EquonApi['artworkEdit']['save']>(async () => ({ ok: true, data: null }))
    installFakeApi([steam({ artwork: ['logo'] })], { artworkEdit: { save } })
    await open()
    const hints = [...document.querySelectorAll('.footer .hint')].map((hint) => hint.textContent)
    expect(hints).toEqual(['Salvar', 'ASelecionar', 'BVoltar'])
    expect(document.querySelector('.footer .hint__menu')).toBeTruthy()

    await click('Remover imagem: Logo')
    press('m')
    await waitFor(() => expect(save).toHaveBeenCalledWith(1, ['logo']))
    expect(await screen.findByText('12h 22m')).toBeTruthy()
  })

  it('does not save with Start while a dialog is open or an image is on its way', async () => {
    const save = vi.fn<EquonApi['artworkEdit']['save']>(async () => ({ ok: true, data: null }))
    let finish: (value: Awaited<ReturnType<EquonApi['artworkEdit']['fromIgdb']>>) => void = () => {}
    installFakeApi([steam({ artwork: ['logo'] })], {
      artworkEdit: {
        save,
        fromIgdb: () =>
          new Promise((resolve) => {
            finish = resolve
          })
      }
    })
    await open()
    await click('Remover imagem: Logo')
    await click('Imagem do IGDB: Capa vertical')
    press('m')
    await act(async () => finish({ ok: true, data: { version: 2 } }))
    expect(save).not.toHaveBeenCalled()

    press('Escape')
    await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    press('m')
    expect(save).not.toHaveBeenCalled()
  })

  it('brings the whole panel into view when focus moves inside it', async () => {
    const seen: (string | null)[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function record(this: Element): void {
      seen.push(this.className)
    }
    try {
      installFakeApi([steam({ artwork: ['logo'] })])
      await open()
      seen.length = 0
      await click('Remover imagem: Logo')
      expect(seen).toEqual(['art-editor__panel'])
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('leaves without asking when nothing changed, saving nothing', async () => {
    const save = vi.fn<EquonApi['artworkEdit']['save']>(async () => ({ ok: true, data: null }))
    installFakeApi([steam()], { artworkEdit: { save } })
    await open()
    await click('Salvar')
    expect(await screen.findByText('12h 22m')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('asks before discarding, and tells main to forget it', async () => {
    const end = vi.fn<EquonApi['artworkEdit']['end']>(async () => {})
    const save = vi.fn<EquonApi['artworkEdit']['save']>(async () => ({ ok: true, data: null }))
    installFakeApi([steam({ artwork: ['logo'] })], { artworkEdit: { end, save } })
    await open()
    await click('Remover imagem: Logo')
    press('Escape')
    expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy()
    await clickText('Descartar')
    expect(await screen.findByText('12h 22m')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
    await waitFor(() => expect(end).toHaveBeenCalled())
  })

  it('keeps the changes and explains when saving fails', async () => {
    installFakeApi([steam({ artwork: ['logo'] })], {
      artworkEdit: { save: async () => ({ ok: false, error: { code: 'storage-failed' } }) }
    })
    await open()
    await click('Remover imagem: Logo')
    await click('Salvar')
    expect(await screen.findByText('Não foi possível salvar as artes. Tente de novo.')).toBeTruthy()
    expect(screen.getByText('Será removida ao salvar.')).toBeTruthy()
  })

  it.each([
    ['wrong-proportion', 'A imagem de fundo precisa ser 16:9 (ex.: 1920×1080).'],
    ['too-large', 'Imagem maior que 20 MB.']
  ])('explains a file it cannot use (%s) on its panel', async (code, message) => {
    installFakeApi([steam()], {
      artworkEdit: { fromFile: async () => ({ ok: false, error: { code } }) },
      files: { list: pickFile }
    })
    await open()
    await click('Selecionar imagem do PC: Imagem de fundo')
    await clickText('art.png')
    const text = await screen.findByText(message)
    expect(text.closest('section')).toBe(panelOf('Imagem de fundo'))
  })
})

describe('Imagem do IGDB', () => {
  const search = (): Mock<EquonApi['igdb']['search']> =>
    vi.fn<EquonApi['igdb']['search']>(async () => ({
      ok: true,
      data: [{ id: 7, name: 'Tidebound', year: 2021, developer: 'Team' }]
    }))

  it('goes straight to the App ID of a Steam game', async () => {
    const fromIgdb = vi.fn<EquonApi['artworkEdit']['fromIgdb']>(async () => ({
      ok: true,
      data: { version: 2 }
    }))
    const find = search()
    installFakeApi([steam()], { artworkEdit: { fromIgdb }, igdb: { search: find } })
    await open()
    await click('Imagem do IGDB: Logo')
    await waitFor(() => expect(fromIgdb).toHaveBeenCalledWith(1, 'logo', null))
    expect(find).not.toHaveBeenCalled()
    await waitFor(() => expect(previewOf('logo').querySelector('img')).toBeTruthy())
  })

  it('asks for the game when the App ID finds nothing', async () => {
    const fromIgdb = vi.fn<EquonApi['artworkEdit']['fromIgdb']>(async (_id, _kind, igdbGameId) =>
      igdbGameId === null
        ? { ok: false, error: { code: 'not-found' } }
        : { ok: true, data: { version: 2 } }
    )
    installFakeApi([steam({ title: 'Tidebound® Saga™' })], {
      artworkEdit: { fromIgdb },
      igdb: { search: search() }
    })
    await open()
    await click('Imagem do IGDB: Logo')
    await clickText('2021 · Team')
    await waitFor(() => expect(fromIgdb).toHaveBeenLastCalledWith(1, 'logo', 7))
  })

  it('confirms the game of a manual one, searching without trademark signs', async () => {
    const fromIgdb = vi.fn<EquonApi['artworkEdit']['fromIgdb']>(async () => ({
      ok: true,
      data: { version: 2 }
    }))
    const find = search()
    installFakeApi([summary(1, 'Tidebound® Saga™')], {
      artworkEdit: { fromIgdb },
      igdb: { search: find }
    })
    await open()
    await click('Imagem do IGDB: Imagem de fundo')
    await waitFor(() => expect(find).toHaveBeenCalledWith('Tidebound Saga'))
    expect(fromIgdb).not.toHaveBeenCalled()
    await clickText('2021 · Team')
    await waitFor(() => expect(fromIgdb).toHaveBeenCalledWith(1, 'background', 7))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it.each([
    ['no-image', 'O IGDB não tem esta imagem para este jogo.'],
    ['not-configured', 'Configure o Client ID e o Client Secret do IGDB em Configurações.'],
    ['download-failed', 'Não foi possível baixar a imagem. Tente de novo.']
  ])('explains a failure (%s) on the panel', async (code, message) => {
    installFakeApi([steam()], {
      artworkEdit: { fromIgdb: async () => ({ ok: false, error: { code } }) }
    })
    await open()
    await click('Imagem do IGDB: Logo')
    expect((await screen.findByText(message)).closest('section')).toBe(panelOf('Logo'))
  })

  it('explains a failed search in its dialog', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      igdb: { search: async () => ({ ok: false, error: { code: 'network' } }) }
    })
    await open()
    await click('Imagem do IGDB: Logo')
    expect(await screen.findByText('Sem conexão com o IGDB. Tente mais tarde.')).toBeTruthy()
  })
})

describe('Steam gallery', () => {
  const button = 'Imagens da Steam: Imagem de fundo'
  const choices: EquonApi['artworkEdit']['steamChoices'] = async () => ({
    ok: true,
    data: [
      { id: 1, store: true },
      { id: 2, store: false },
      { id: 3, store: false }
    ]
  })

  it('is offered only for the background of a Steam game', async () => {
    installFakeApi([steam()])
    await open()
    expect(screen.getByLabelText(button)).toBeTruthy()
    expect(screen.queryByLabelText(/^Imagens da Steam: (?!Imagem de fundo)/)).toBeNull()
    cleanup()

    installFakeApi([summary(1, 'Tidebound')])
    await open()
    expect(screen.queryByLabelText(button)).toBeNull()
  })

  it('names the store background and numbers the screenshots, and the choice previews', async () => {
    const fromSteam = vi.fn<EquonApi['artworkEdit']['fromSteam']>(async () => ({
      ok: true,
      data: { version: 4 }
    }))
    const save = vi.fn<EquonApi['artworkEdit']['save']>(async () => ({ ok: true, data: null }))
    installFakeApi([steam()], { artworkEdit: { steamChoices: choices, fromSteam, save } })
    await open()
    await click(button)

    const dialog = await screen.findByRole('dialog', { name: 'Imagens da Steam' })
    expect([...dialog.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      'equon-art://steam/1',
      'equon-art://steam/2',
      'equon-art://steam/3'
    ])
    expect(within(dialog).getByText('Fundo da loja')).toBeTruthy()
    expect(within(dialog).getByText('Print 2')).toBeTruthy()
    expect(dialog.querySelector('[data-focused="true"]')?.getAttribute('aria-label')).toBe(
      'Fundo da loja'
    )

    await click('Print 1')
    await waitFor(() => expect(fromSteam).toHaveBeenCalledWith(1, 2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(previewOf('background').querySelector('img')?.getAttribute('src')).toBe(
      'equon-art://draft/background?v=4'
    )
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps the gallery open and explains an image of another proportion', async () => {
    installFakeApi([steam()], {
      artworkEdit: {
        steamChoices: choices,
        fromSteam: async () => ({ ok: false, error: { code: 'wrong-proportion' } })
      }
    })
    await open()
    await click(button)
    await screen.findByRole('dialog', { name: 'Imagens da Steam' })
    await click('Print 1')
    expect((await screen.findByRole('alert')).textContent).toContain('16:9')
    expect(screen.getByRole('dialog', { name: 'Imagens da Steam' })).toBeTruthy()
  })

  it.each([
    ['network', 'Sem conexão com a Steam. Tente mais tarde.'],
    ['unavailable', 'A Steam está indisponível agora. Tente mais tarde.'],
    ['not-found', 'A Steam não encontrou este jogo.']
  ])('explains %s in the panel', async (code, message) => {
    installFakeApi([steam()], {
      artworkEdit: { steamChoices: async () => ({ ok: false, error: { code } }) }
    })
    await open()
    await click(button)
    expect(await within(panelOf('Imagem de fundo')).findByText(message)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says so when Steam has no images', async () => {
    installFakeApi([steam()])
    await open()
    await click(button)
    expect(
      await within(panelOf('Imagem de fundo')).findByText(
        'A Steam não tem imagens 16:9 deste jogo.'
      )
    ).toBeTruthy()
  })
})

describe('SteamGridDB gallery', () => {
  const assets: EquonApi['artworkEdit']['gridAssets'] = async () => ({
    ok: true,
    data: [
      { id: 21, width: 600, height: 900 },
      { id: 22, width: 1200, height: 1800 }
    ]
  })

  it('shows thumbnails of a Steam game, and the choice becomes the preview', async () => {
    const gridAssets = vi.fn<EquonApi['artworkEdit']['gridAssets']>(assets)
    const fromGrid = vi.fn<EquonApi['artworkEdit']['fromGrid']>(async () => ({
      ok: true,
      data: { version: 3 }
    }))
    installFakeApi([steam()], { artworkEdit: { gridAssets, fromGrid } })
    await open()
    await click('Selecionar imagem do SteamGridDB: Capa vertical')
    await waitFor(() => expect(gridAssets).toHaveBeenCalledWith(1, 'cover_portrait', null))

    const dialog = await screen.findByRole('dialog', { name: 'Imagens do SteamGridDB' })
    const sources = [...dialog.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources).toEqual(['equon-art://grid/21', 'equon-art://grid/22'])
    expect(dialog.querySelector('[data-focused="true"]')?.getAttribute('aria-label')).toBe(
      'Imagem 600×900'
    )

    await click('Imagem 1200×1800')
    await waitFor(() => expect(fromGrid).toHaveBeenCalledWith(1, 'cover_portrait', 22))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(previewOf('cover_portrait').querySelector('img')?.getAttribute('src')).toBe(
      'equon-art://draft/cover_portrait?v=3'
    )
  })

  it('confirms the game of a manual one first', async () => {
    const gridAssets = vi.fn<EquonApi['artworkEdit']['gridAssets']>(assets)
    installFakeApi([summary(1, 'Tidebound')], {
      artworkEdit: { gridAssets },
      artwork: {
        search: async () => ({ ok: true, data: [{ id: 77, name: 'Tidebound', year: 2021 }] })
      }
    })
    await open()
    await click('Selecionar imagem do SteamGridDB: Logo')
    await clickText('2021')
    await waitFor(() => expect(gridAssets).toHaveBeenCalledWith(1, 'logo', 77))
    expect(await screen.findByRole('dialog', { name: 'Imagens do SteamGridDB' })).toBeTruthy()
  })

  it('searches by name when the App ID has no images, then says when none has', async () => {
    const gridAssets = vi.fn<EquonApi['artworkEdit']['gridAssets']>(async () => ({
      ok: true,
      data: []
    }))
    installFakeApi([steam()], {
      artworkEdit: { gridAssets },
      artwork: {
        search: async () => ({ ok: true, data: [{ id: 77, name: 'Tidebound', year: 2021 }] })
      }
    })
    await open()
    await click('Selecionar imagem do SteamGridDB: Logo')
    await clickText('2021')
    await waitFor(() => expect(gridAssets).toHaveBeenLastCalledWith(1, 'logo', 77))
    const text = await screen.findByText('O SteamGridDB não tem imagens deste tipo para este jogo.')
    expect(text.closest('section')).toBe(panelOf('Logo'))
  })

  it('stays open and explains when the chosen image fails', async () => {
    installFakeApi([steam()], {
      artworkEdit: {
        gridAssets: assets,
        fromGrid: async () => ({ ok: false, error: { code: 'download-failed' } })
      }
    })
    await open()
    await click('Selecionar imagem do SteamGridDB: Logo')
    await click('Imagem 600×900')
    expect(await screen.findByText('Não foi possível baixar a imagem. Tente de novo.')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Imagens do SteamGridDB' })).toBeTruthy()
    await click('Fechar')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('explains a missing key on the panel', async () => {
    installFakeApi([steam()], {
      artworkEdit: { gridAssets: async () => ({ ok: false, error: { code: 'not-configured' } }) }
    })
    await open()
    await click('Selecionar imagem do SteamGridDB: Logo')
    expect(
      await screen.findByText('Configure a chave do SteamGridDB em Configurações.')
    ).toBeTruthy()
  })
})
