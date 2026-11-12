// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type {
  AchievementItem,
  EquonApi,
  GameAchievements,
  GameSummary
} from '../../src/shared/ipc/contract'
import { installFakeApi, settingsInfo, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}
const focused = (): string | null =>
  document.querySelector('[data-focused="true"]')?.getAttribute('aria-label') ?? null
const detail = (): string => document.querySelector('.home-spotlight__detail')?.textContent ?? ''

const achievement = (id: number, name: string): AchievementItem => ({
  id,
  name,
  description: `Descrição de ${name}`,
  unlockedAt: `2026-11-0${id}T20:00:00Z`,
  globalPercent: 12.5,
  tier: 'gold',
  iconCached: false
})
const achievements = (extra: Partial<GameAchievements> = {}): GameAchievements => ({
  id: 1,
  title: 'Tidebound',
  status: 'ready',
  stale: false,
  unlockedCount: 6,
  total: 10,
  percent: 60,
  platinum: false,
  trophies: { platine: 0, gold: 6, silver: 0, bronze: 0 },
  // Newest first, as main sends them.
  unlocked: [6, 5, 4, 3, 2, 1].map((n) => achievement(n, `Conquista ${n}`)),
  locked: [],
  ...extra
})

/** "Em cima" with one game, whose achievements are `data`. */
const openTopHome = async (
  data: GameAchievements | null,
  overrides: { ensureIcons?: EquonApi['achievements']['ensureIcons'] } = {},
  game: GameSummary = summary(1, 'Tidebound')
): Promise<void> => {
  installFakeApi([game], {
    settings: {
      get: async () => settingsInfo({ homeCovers: { size: 74, gap: 35, position: 'top' } })
    },
    achievements: { game: async () => data, ...overrides }
  })
  render(<App />)
  await waitFor(() => expect(document.querySelector('.home-spotlight')).toBeTruthy())
  await waitFor(() => expect(focused()).toBe('Tidebound'))
}

describe('"Em cima" panel (D-29)', () => {
  it('shows the play stats and the 4 latest achievements of the focused game', async () => {
    await openTopHome(achievements())
    expect(document.querySelector('.home-spotlight__playtime')?.textContent).toContain('12h 22m')
    expect(await screen.findByText('6 de 10 conquistas · 60%')).toBeTruthy()
    const tiles = Array.from(document.querySelectorAll('.home-spotlight__tile')).map((tile) =>
      tile.getAttribute('aria-label')
    )
    expect(tiles).toEqual(['Conquista 6', 'Conquista 5', 'Conquista 4', 'Conquista 3', 'Ver todas'])
  })

  it('down enters the row, left and right walk it, up and B come back to the cover', async () => {
    const ensureIcons = vi.fn<EquonApi['achievements']['ensureIcons']>(async () => {})
    await openTopHome(achievements(), { ensureIcons })
    await screen.findByText('6 de 10 conquistas · 60%')

    press('ArrowDown')
    expect(focused()).toBe('Conquista 6')
    // The focused achievement is described under the row.
    expect(detail()).toContain('Descrição de Conquista 6')
    expect(detail()).toContain('12.5%')
    // Coming down asks for the missing icons, once (owner decision, D-29).
    await waitFor(() => expect(ensureIcons).toHaveBeenCalledWith(1))

    press('ArrowRight')
    expect(focused()).toBe('Conquista 5')
    press('ArrowLeft')
    press('ArrowLeft')
    expect(focused()).toBe('Conquista 6')
    for (let i = 0; i < 5; i++) press('ArrowRight')
    expect(focused()).toBe('Ver todas')
    expect(detail()).toBe('Abre as conquistas deste jogo.')

    press('ArrowUp')
    expect(focused()).toBe('Tidebound')
    press('ArrowDown')
    press('Escape')
    expect(focused()).toBe('Tidebound')
    expect(ensureIcons).toHaveBeenCalledOnce()
  })

  it('A on an achievement opens the game achievements page', async () => {
    await openTopHome(achievements())
    await screen.findByText('6 de 10 conquistas · 60%')
    press('ArrowDown')
    press('Enter')
    expect(await screen.findByRole('heading', { name: 'Tidebound' })).toBeTruthy()
    expect(document.querySelector('.home-spotlight')).toBeNull()
  })

  it('hides the whole achievements block when none is unlocked (owner decision)', async () => {
    for (const data of [
      achievements({ status: 'none', total: 0, unlocked: [] }),
      achievements({ status: 'never-synced', unlocked: [] }),
      achievements({ unlockedCount: 0, percent: 0, unlocked: [] }),
      null
    ]) {
      await openTopHome(data)
      // The play stats stay; the block never shows, and down has nothing to enter.
      expect(document.querySelector('.home-spotlight__playtime')?.textContent).toContain('12h 22m')
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 250)))
      expect(document.querySelector('.home-spotlight__achievements')).toBeNull()
      press('ArrowDown')
      expect(focused()).toBe('Tidebound')
      cleanup()
    }
  })

  it('fixes the size and spacing of "Em cima" at 18 and 4, whatever is stored', async () => {
    await openTopHome(achievements())
    const shelf = document.querySelector<HTMLElement>('.home-shelf')
    expect(shelf?.style.getPropertyValue('--card-width')).toBe('11.5rem')
    expect(shelf?.style.getPropertyValue('--card-gap')).toBe('0.4rem')
  })

  it('stays off the other positions', async () => {
    installFakeApi([summary(1, 'Tidebound')], {
      settings: {
        get: async () => settingsInfo({ homeCovers: { size: 30, gap: 5, position: 'bottom' } })
      }
    })
    render(<App />)
    await waitFor(() => expect(document.querySelector('.home-shelf')).toBeTruthy())
    expect(document.querySelector('.home-spotlight')).toBeNull()
  })
})
