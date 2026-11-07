// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import { formatBytes } from '../../src/renderer/src/data/format'
import type { DriveInfo, EquonApi } from '../../src/shared/ipc/contract'
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
const openTab = async (listDrives: EquonApi['app']['listDrives']): Promise<void> => {
  installFakeApi([summary(1, 'Tidebound')], { app: { listDrives } })
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

  it('fills the bar with the space in use', async () => {
    await openTab(async () => ({ ok: true, data: [drive({ freeBytes: 25 * GB })] }))
    const bar = await screen.findByRole('progressbar', { name: 'Disco Local' })
    expect(bar.getAttribute('aria-valuenow')).toBe('75')
    expect((bar.firstElementChild as HTMLElement).style.transform).toBe('scaleX(0.75)')
    expect((bar.firstElementChild as HTMLElement).dataset.low).toBe('false')
  })

  it('warns in red when under 10% is free', async () => {
    await openTab(async () => ({ ok: true, data: [drive({ freeBytes: 5 * GB })] }))
    const bar = await screen.findByRole('progressbar')
    expect((bar.firstElementChild as HTMLElement).dataset.low).toBe('true')
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
