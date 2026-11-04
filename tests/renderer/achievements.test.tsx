// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import { sortAchievementGames } from '../../src/shared/achievements-view'
import type {
  AchievementGameSummary,
  AchievementsOverview,
  EquonApi,
  GameAchievements
} from '../../src/shared/ipc/contract'
import { installFakeApi, summary } from './fake-api'

afterEach(cleanup)

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}

const row = (
  id: number,
  title: string,
  percent: number,
  timeLastPlayed: string | null
): AchievementGameSummary => ({
  id,
  title,
  originName: 'Steam',
  hidden: false,
  timeLastPlayed,
  artwork: [],
  unlocked: percent,
  total: 100,
  percent,
  platinum: percent === 100
})

const overview: AchievementsOverview = {
  total: 797,
  trophies: { platine: 4, gold: 96, silver: 239, bronze: 458 },
  games: [
    row(1, 'Older', 90, '2026-10-01T10:00:00Z'),
    row(2, 'Newest', 10, '2026-11-01T10:00:00Z'),
    row(3, 'Never played', 50, null)
  ],
  neverSynced: false
}

const details = (extra: Partial<GameAchievements> = {}): GameAchievements => ({
  id: 2,
  title: 'Newest',
  status: 'ready',
  stale: false,
  unlockedCount: 1,
  total: 2,
  percent: 50,
  platinum: false,
  trophies: { platine: 0, gold: 1, silver: 0, bronze: 0 },
  unlocked: [
    {
      id: 11,
      name: 'Primeira',
      description: 'Faça algo',
      unlockedAt: '2026-03-20T22:35:00Z',
      globalPercent: 5.2,
      tier: 'gold',
      iconCached: false
    }
  ],
  locked: [
    {
      id: 12,
      name: 'Segredo',
      description: null,
      unlockedAt: null,
      globalPercent: null,
      tier: 'bronze',
      iconCached: true
    }
  ],
  ...extra
})

const cards = (): (string | null)[] =>
  Array.from(document.querySelectorAll('.achievement-game')).map((c) =>
    c.getAttribute('aria-label')
  )

const openOverview = async (): Promise<void> => {
  render(<App />)
  await screen.findByText('Início')
  press('e')
  press('e')
  await screen.findByRole('heading', { name: 'Conquistas' })
}

describe('sortAchievementGames', () => {
  it('sorts by last session (unknown last) or by completion', () => {
    expect(sortAchievementGames(overview.games, 'recent').map((g) => g.title)).toEqual([
      'Newest',
      'Older',
      'Never played'
    ])
    expect(sortAchievementGames(overview.games, 'completion').map((g) => g.title)).toEqual([
      'Older',
      'Never played',
      'Newest'
    ])
  })
})

describe('achievements overview', () => {
  it('shows real totals, the list by last session, and changes the sort with X', async () => {
    installFakeApi([summary(1, 'A')], { achievements: { overview: async () => overview } })
    await openOverview()
    expect(await screen.findByText('797')).toBeTruthy()
    expect(screen.getByText('458')).toBeTruthy()
    expect(cards()).toEqual(['Newest', 'Older', 'Never played'])
    expect(document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')).toBe(
      'Newest'
    )

    press('x')
    await waitFor(() => expect(cards()).toEqual(['Older', 'Never played', 'Newest']))
    expect(screen.getByLabelText('Ordenar: Conclusão')).toBeTruthy()
  })

  it('keeps the sort after opening a game and coming back', async () => {
    installFakeApi([summary(1, 'A')], {
      achievements: { overview: async () => overview, game: async () => details() }
    })
    await openOverview()
    await screen.findByText('797')
    press('x')
    await waitFor(() => expect(cards()[0]).toBe('Older'))
    press('Enter')
    await screen.findByText('Conquistas obtidas')
    press('Escape')
    await screen.findByText('797')
    expect(cards()[0]).toBe('Older')
  })

  it('starts empty, offers the sync and only syncs when asked', async () => {
    const syncAll = vi.fn<EquonApi['achievements']['syncAll']>(async () => ({
      running: false,
      done: 0,
      total: 0,
      failures: [],
      lastRun: null
    }))
    installFakeApi([summary(1, 'A')], { achievements: { syncAll } })
    await openOverview()
    expect(await screen.findByText('As conquistas ainda não foram sincronizadas.')).toBeTruthy()
    expect(syncAll).not.toHaveBeenCalled()
    act(() => screen.getByLabelText('Sincronizar conquistas').click())
    expect(syncAll).toHaveBeenCalledOnce()
  })

  it('shows progress while syncing and the outcome after', async () => {
    let status = { running: true, done: 12, total: 33, failures: [], lastRun: null } as Awaited<
      ReturnType<EquonApi['achievements']['status']>
    >
    let notify = (): void => {}
    installFakeApi([summary(1, 'A')], {
      achievements: {
        overview: async () => overview,
        status: async () => status,
        onChanged: (listener) => {
          const previous = notify
          notify = () => {
            previous()
            listener()
          }
          return () => {}
        }
      }
    })
    await openOverview()
    expect(await screen.findByText('Sincronizando 12 de 33 jogos…')).toBeTruthy()
    expect(screen.getByLabelText('Sincronizar conquistas').getAttribute('aria-disabled')).toBe(
      'true'
    )
    status = {
      running: false,
      done: 33,
      total: 33,
      failures: [{ title: 'X', reason: 'network' }],
      lastRun: '2026-11-04T12:00:00Z'
    }
    act(() => notify())
    expect(await screen.findByText('1 de 33 jogos não pôde ser sincronizado.')).toBeTruthy()
  })
})

describe('game achievements', () => {
  const open = async (game: GameAchievements | null): Promise<void> => {
    installFakeApi([summary(1, 'A')], {
      achievements: { overview: async () => overview, game: async () => game }
    })
    await openOverview()
    await screen.findByText('797')
    press('Enter')
  }

  it('separates unlocked and locked, with unknown values shown as unknown', async () => {
    await open(details())
    expect(await screen.findByText('Conquistas obtidas')).toBeTruthy()
    expect(screen.getByText('Conquistas bloqueadas')).toBeTruthy()
    expect(screen.getByText('5.2%')).toBeTruthy()
    expect(screen.getByText('—')).toBeTruthy()
    expect(screen.getByText('Conquista oculta')).toBeTruthy()
    expect(screen.getByText('--/--/---- --:--')).toBeTruthy()
    // Locked icons are shown too.
    const locked = screen.getByLabelText('Segredo')
    expect(locked.getAttribute('data-locked')).toBe('true')
    expect(locked.querySelector('img.achievement__icon')?.getAttribute('src')).toBe(
      'equon-art://achievement/12'
    )
    press('Escape')
    expect(await screen.findByText('797')).toBeTruthy()
  })

  it('asks main for the icons of the open game only', async () => {
    const ensureIcons = vi.fn<EquonApi['achievements']['ensureIcons']>(async () => {})
    installFakeApi([summary(1, 'A')], {
      achievements: { overview: async () => overview, game: async () => details(), ensureIcons }
    })
    await openOverview()
    expect(ensureIcons).not.toHaveBeenCalled()
    await screen.findByText('797')
    press('Enter')
    await waitFor(() => expect(ensureIcons).toHaveBeenCalledWith(2))
    expect(ensureIcons).toHaveBeenCalledOnce()
  })

  it('highlights the platinum instead of the locked column', async () => {
    await open(
      details({
        platinum: true,
        unlockedCount: 1,
        total: 1,
        percent: 100,
        locked: [],
        trophies: { platine: 1, gold: 1, silver: 0, bronze: 0 }
      })
    )
    expect(await screen.findByText('Platinado')).toBeTruthy()
    expect(screen.queryByText('Conquistas bloqueadas')).toBeNull()
  })

  it('explains a game without achievements as information, not as an error', async () => {
    await open(details({ status: 'none', total: 0, percent: null, unlocked: [], locked: [] }))
    const message = await screen.findByText('Este jogo não possui conquistas.')
    expect(message.closest('[role="alert"]')).toBeNull()
  })

  it('marks stale data while still showing it', async () => {
    await open(details({ stale: true }))
    expect(
      await screen.findByText('Dados desatualizados: a última sincronização deste jogo falhou.')
    ).toBeTruthy()
    expect(screen.getByText('Primeira')).toBeTruthy()
  })

  it('opens from the game options menu', async () => {
    const game = vi.fn<EquonApi['achievements']['game']>(async () => details({ id: 1, title: 'A' }))
    installFakeApi([summary(1, 'A')], { achievements: { game } })
    render(<App />)
    await screen.findByText('12h 22m')
    press('m')
    const item = await screen.findByText('Conquistas', { selector: '.choice__label' })
    act(() => (item.closest('button') as HTMLElement).click())
    await waitFor(() => expect(game).toHaveBeenCalledWith(1))
    expect(await screen.findByText('Conquistas obtidas')).toBeTruthy()
  })
})
