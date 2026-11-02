import { vi } from 'vitest'
import type { EquonApi, GameDetails, GameSummary, OriginInfo } from '../../src/shared/ipc/contract'

export const summary = (
  id: number,
  title: string,
  extra: Partial<GameSummary> = {}
): GameSummary => ({
  id,
  title,
  origin: 'manual',
  originName: 'Jogo Local',
  installed: true,
  playtime: 742,
  timeLastPlayed: `2026-11-0${id}T10:00:00Z`,
  beated: false,
  artwork: [],
  ...extra
})

export const details = (game: GameSummary, extra: Partial<GameDetails> = {}): GameDetails => ({
  ...game,
  description: 'Uma descrição.',
  developer: 'Estúdio A',
  releaseDate: '2020-05-01',
  requiredAge: '14',
  genres: ['Ação'],
  achievements: { total: 50, unlocked: 16, platinum: false },
  editable: game.origin !== 'steam',
  launchable: game.origin !== 'steam' && game.installed === true,
  ...extra
})

export const origins: OriginInfo[] = [
  {
    key: 'manual',
    name: 'Jogo Local',
    builtin: true,
    defaultExecutablePath: null,
    defaultArguments: null
  },
  {
    key: 'ps2',
    name: 'PlayStation 2',
    builtin: true,
    defaultExecutablePath: null,
    defaultArguments: null
  },
  {
    key: 'steam',
    name: 'Steam',
    builtin: true,
    defaultExecutablePath: null,
    defaultArguments: null
  }
]

/** Installs a complete fake `window.equon`; pass overrides per test. */
export function installFakeApi(
  games: GameSummary[],
  overrides: {
    games?: Partial<EquonApi['games']>
    origins?: Partial<EquonApi['origins']>
    files?: Partial<EquonApi['files']>
  } = {}
): EquonApi {
  const runningListeners = new Set<(ids: number[]) => void>()
  const api: EquonApi = {
    app: { getInfo: async () => ({ name: 'equon', version: '0.1.0' }) },
    games: {
      list: async () => games,
      get: async (id) => {
        const game = games.find((g) => g.id === id)
        return game ? details(game) : null
      },
      getEditable: async () => null,
      create: async () => ({ ok: true, data: { id: 99 } }),
      update: async (id) => ({ ok: true, data: { id } }),
      remove: async () => ({ ok: true, data: null }),
      launch: async () => ({ ok: true, data: null }),
      running: async () => [],
      onRunningChanged: (listener) => {
        runningListeners.add(listener)
        return () => runningListeners.delete(listener)
      },
      ...overrides.games
    },
    origins: {
      list: async () => origins,
      create: vi.fn(),
      rename: vi.fn(),
      remove: vi.fn(),
      setDefaults: vi.fn(),
      ...overrides.origins
    },
    files: {
      list: async () => ({
        ok: true,
        data: { path: null, parent: null, entries: [], truncated: false }
      }),
      pickNative: async () => null,
      ...overrides.files
    }
  }
  Object.defineProperty(window, 'equon', { value: api, configurable: true })
  return api
}
