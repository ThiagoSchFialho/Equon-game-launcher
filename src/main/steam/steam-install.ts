import type { GameRepository } from '../../core/application'
import { BuiltinOrigin, steamInstallUrl, steamUninstallUrl } from '../../core/domain'
import type { Result } from '../../shared/ipc/contract'

export interface SteamInstallDeps {
  games: Pick<GameRepository, 'getById'>
  runningGameIds(): number[]
  /** Opens one of the two URLs above; never anything from the renderer. */
  open(url: string): Promise<void>
  onError?(error: unknown): void
}

export interface SteamInstall {
  install(gameId: number): Promise<Result<null>>
  uninstall(gameId: number): Promise<Result<null>>
}

const fail = (code: string): Result<null> => ({ ok: false, error: { code } })

/**
 * Hands installing and uninstalling to Steam's own windows (D-23). The launcher only asks: the
 * user answers there, and the local check of the library sees what changed. The App ID comes from
 * the database, never from the renderer.
 */
export function createSteamInstall(deps: SteamInstallDeps): SteamInstall {
  const open = async (url: string): Promise<Result<null>> => {
    try {
      await deps.open(url)
      return { ok: true, data: null }
    } catch (error) {
      deps.onError?.(error)
      return fail('steam-open-failed')
    }
  }

  return {
    install(gameId) {
      const game = deps.games.getById(gameId)
      if (game?.origin !== BuiltinOrigin.steam || game.steamAppId === null) {
        return Promise.resolve(fail('not-found'))
      }
      if (game.installed !== false) return Promise.resolve(fail('invalid'))
      return open(steamInstallUrl(game.steamAppId))
    },

    uninstall(gameId) {
      const game = deps.games.getById(gameId)
      if (game?.origin !== BuiltinOrigin.steam || game.steamAppId === null) {
        return Promise.resolve(fail('not-found'))
      }
      if (game.installed !== true) return Promise.resolve(fail('invalid'))
      if (deps.runningGameIds().includes(gameId)) return Promise.resolve(fail('already-running'))
      return open(steamUninstallUrl(game.steamAppId))
    }
  }
}
