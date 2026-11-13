// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import { formatBytes } from '../../src/renderer/src/data/format'
import type { DriveInfo, EquonApi, GameSizeInfo } from '../../src/shared/ipc/contract'
import { installFakeApi, summary } from './fake-api'

afterEach(cleanup)

const GB = 1024 ** 3
const drive = (extra: Partial<DriveInfo>): DriveInfo => ({
  letter: 'C:',
  label: null,
  removable: false,
  totalBytes: 100 * GB,
  freeBytes: 50 * GB,
  ...extra
})

const clickText = async (text: string): Promise<void> => {
  const [element] = await screen.findAllByText(text)
  act(() => (element.closest('button') ?? element).click())
}
const size = (gameId: number, title: string, extra: Partial<GameSizeInfo>): GameSizeInfo => ({
  gameId,
  title,
  drive: 'C:',
  bytes: null,
  kind: 'exact',
  truncated: false,
  shared: false,
  ...extra
})
const openTab = async (
  listDrives: EquonApi['app']['listDrives'],
  sizes: Partial<Pick<EquonApi['app'], 'gameSizes' | 'gameFolderSize'>> = {}
): Promise<void> => {
  installFakeApi([summary(1, 'Tidebound')], { app: { listDrives, ...sizes } })
  render(<App />)
  await screen.findByText('12h 22m')
  act(() => (screen.getByLabelText('Menu do sistema') as HTMLElement).click())
  await clickText('Configurações')
  await clickText('Armazenamento')
}

describe('formatBytes', () => {
  it('shows it as Windows does', () => {
    expect(formatBytes(81123536896)).toBe('75,5 GB')
    expect(formatBytes(206632693760)).toBe('192 GB')
    // 931,5: the owner's screenshot of Windows shows 931.
    expect(formatBytes(1000203087872)).toBe('931 GB')
    expect(formatBytes(1.5 * 1024 * GB)).toBe('1,5 TB')
    expect(formatBytes(512 * 1024 ** 2)).toBe('512 MB')
    expect(formatBytes(0)).toBe('0 MB')
  })
})

describe('Settings › Armazenamento', () => {
  it('shows each disk by its name and letter, with its free space', async () => {
    await openTab(async () => ({
      ok: true,
      data: [
        drive({ totalBytes: 238887628800, freeBytes: 81123536896 }),
        drive({ letter: 'D:', label: 'SSD', totalBytes: 1000203087872, freeBytes: 206632693760 }),
        drive({ letter: 'F:', removable: true })
      ]
    }))
    expect(await screen.findByText('Disco Local (C:)')).toBeTruthy()
    expect(screen.getByText('SSD (D:)')).toBeTruthy()
    expect(screen.getByText('Disco removível (F:)')).toBeTruthy()
    expect(screen.getByText('75,5 GB livres de 222 GB')).toBeTruthy()
    expect(screen.getByText('192 GB livres de 931 GB')).toBeTruthy()
  })

  it('splits the bar by game, largest first, then other files and the free space (D-34)', async () => {
    await openTab(async () => ({ ok: true, data: [drive({ freeBytes: 25 * GB })] }), {
      gameSizes: async () => [
        size(1, 'Small', { bytes: 5 * GB }),
        size(2, 'Large', { bytes: 30 * GB }),
        size(3, 'Elsewhere', { bytes: 9 * GB, drive: 'D:' })
      ]
    })
    await screen.findByText('Jogos no Equon: 35 GB')
    const bar = screen.getByRole('img', { name: /^Disco Local:/ })
    const widths = Array.from(bar.children).map((child) => (child as HTMLElement).style.width)
    // Large, Small, other files (75 used - 35 games = 40), free; percentages of 100 GB.
    expect(widths).toEqual(['30%', '5%', '40%', '25%'])
    const labels = Array.from(document.querySelectorAll('.settings__drive-label')).map(
      (label) => label.textContent
    )
    expect(labels).toEqual(['Large', 'Small', 'Outros arquivos', 'Espaço livre'])
    // A game on another drive is not on this one.
    expect(screen.queryByText('Elsewhere')).toBeNull()
  })

  it('colours nine games at most; the rest share one neutral segment', async () => {
    await openTab(async () => ({ ok: true, data: [drive({ freeBytes: 10 * GB })] }), {
      gameSizes: async () =>
        Array.from({ length: 11 }, (_, i) => size(i + 1, `Jogo ${i + 1}`, { bytes: (12 - i) * GB }))
    })
    await screen.findByText('Outros 2 jogos')
    const dots = Array.from(document.querySelectorAll<HTMLElement>('.settings__drive-dot')).map(
      (dot) => dot.style.background
    )
    expect(dots.slice(0, 9)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `var(--color-chart-${n})`)
    )
    expect(dots[9]).toBe('var(--color-chart-other)')
  })

  it('sums game folders afterwards, one by one, and says when a size is approximate', async () => {
    const gameFolderSize = vi.fn<EquonApi['app']['gameFolderSize']>(async (id) =>
      size(id, 'Manual', { kind: 'approx', bytes: 2 * GB })
    )
    await openTab(async () => ({ ok: true, data: [drive({})] }), {
      gameSizes: async () => [size(7, 'Manual', { kind: 'pending' })],
      gameFolderSize
    })
    expect(await screen.findByText('aprox. 2 GB')).toBeTruthy()
    expect(gameFolderSize).toHaveBeenCalledWith(7)
  })

  it('lists every game of a drive in "Ver todos", unknown and shared ones included', async () => {
    await openTab(async () => ({ ok: true, data: [drive({})] }), {
      gameSizes: async () => [
        size(1, 'Steam game', { bytes: 3 * GB }),
        size(2, 'Shortcut', { kind: 'unknown' }),
        size(3, 'Big folder', { kind: 'approx', bytes: 4 * GB, truncated: true, shared: true })
      ]
    })
    await clickText('Ver todos')
    const dialog = await screen.findByRole('dialog', { name: 'Jogos em Disco Local (C:)' })
    expect(dialog.textContent).toContain('tamanho desconhecido')
    expect(dialog.textContent).toContain('mais de 4 GB · pasta compartilhada')
  })

  it('says little free space in red', async () => {
    await openTab(async () => ({ ok: true, data: [drive({ freeBytes: 5 * GB })] }))
    const free = await screen.findByText('5 GB livres de 100 GB')
    expect(free.dataset.low).toBe('true')
  })

  it('has loading, empty and error states, and can try again', async () => {
    const listDrives = vi
      .fn<EquonApi['app']['listDrives']>()
      .mockResolvedValueOnce({ ok: false, error: { code: 'drives-failed' } })
      .mockResolvedValue({ ok: true, data: [] })
    await openTab(listDrives)
    expect(await screen.findByText('Não foi possível ler os discos.')).toBeTruthy()
    await clickText('Tentar novamente')
    expect(await screen.findByText('Nenhum disco encontrado.')).toBeTruthy()
    await waitFor(() => expect(listDrives).toHaveBeenCalledTimes(2))
  })

  it('reads the disks again each time the tab opens', async () => {
    const listDrives = vi.fn<EquonApi['app']['listDrives']>(async () => ({ ok: true, data: [] }))
    await openTab(listDrives)
    await screen.findByText('Nenhum disco encontrado.')
    await clickText('Sobre')
    await clickText('Armazenamento')
    await waitFor(() => expect(listDrives).toHaveBeenCalledTimes(2))
  })
})
