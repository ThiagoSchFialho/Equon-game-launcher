import { describe, expect, it, vi } from 'vitest'
import { createSteamInstall } from '../../../src/main/steam/steam-install'
import type { Game } from '../../../src/core/domain'

const NOT_FOUND = { ok: false, error: { code: 'not-found' } }
const INVALID = { ok: false, error: { code: 'invalid' } }

const setup = (
  game: Partial<Game> | null,
  running: number[] = []
): {
  install: ReturnType<typeof createSteamInstall>
  open: ReturnType<typeof vi.fn<(url: string) => Promise<void>>>
} => {
  const open = vi.fn<(url: string) => Promise<void>>(async () => {})
  const install = createSteamInstall({
    games: { getById: () => (game ? ({ id: 1, ...game } as Game) : null) },
    runningGameIds: () => running,
    open
  })
  return { install, open }
}
const steam = (installed: boolean | null): Partial<Game> => ({
  origin: 'steam',
  steamAppId: 620,
  installed
})

describe('install and uninstall through Steam', () => {
  it('opens the install window of a game confirmed not installed', async () => {
    const { install, open } = setup(steam(false))
    await expect(install.install(1)).resolves.toEqual({ ok: true, data: null })
    expect(open).toHaveBeenCalledExactlyOnceWith('steam://install/620')
  })

  it('opens the uninstall confirmation of an installed game', async () => {
    const { install, open } = setup(steam(true))
    await expect(install.uninstall(1)).resolves.toEqual({ ok: true, data: null })
    expect(open).toHaveBeenCalledExactlyOnceWith('steam://uninstall/620')
  })

  it('refuses what the state does not allow, including an unknown state', async () => {
    for (const [installed, action] of [
      [true, 'install'],
      [null, 'install'],
      [false, 'uninstall'],
      [null, 'uninstall']
    ] as const) {
      const { install, open } = setup(steam(installed))
      await expect(install[action](1), `${action} ${installed}`).resolves.toEqual(INVALID)
      expect(open).not.toHaveBeenCalled()
    }
  })

  it('does not uninstall a game that is running', async () => {
    const { install, open } = setup(steam(true), [1])
    await expect(install.uninstall(1)).resolves.toEqual({
      ok: false,
      error: { code: 'already-running' }
    })
    expect(open).not.toHaveBeenCalled()
  })

  it('refuses games that are not from Steam, and unknown ones', async () => {
    for (const game of [{ origin: 'manual', steamAppId: null, installed: false }, null]) {
      const { install, open } = setup(game)
      await expect(install.install(1)).resolves.toEqual(NOT_FOUND)
      await expect(install.uninstall(1)).resolves.toEqual(NOT_FOUND)
      expect(open).not.toHaveBeenCalled()
    }
  })

  it('reports when Steam cannot be opened', async () => {
    const { install, open } = setup(steam(false))
    open.mockRejectedValueOnce(new Error('no handler'))
    await expect(install.install(1)).resolves.toEqual({
      ok: false,
      error: { code: 'steam-open-failed' }
    })
  })
})
