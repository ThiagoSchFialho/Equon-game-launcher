import {
  applySteamMetadata,
  gamesMissingMetadata,
  importOwnedSteamGames,
  type GameRepository,
  type GenreRepository,
  type OwnedSyncOutcome,
  type UnitOfWork
} from '../../core/application'
import { toUtcIso } from '../../core/domain'
import type { HttpGet } from '../../integrations/http'
import {
  fetchAppDetails,
  fetchOwnedGames,
  fetchPlayerSummary
} from '../../integrations/steam/steam-web'
import { testSteamGridDbKey } from '../../integrations/steamgriddb/steamgriddb'
import type { ConnectionTest, Result, SteamSyncInfo } from '../../shared/ipc/contract'

/** appdetails is limited to about 200 requests per 5 minutes: one every 1.5 s. */
export const METADATA_INTERVAL_MS = 1500

export interface SteamOnlineDeps {
  games: GameRepository
  genres: GenreRepository
  uow: UnitOfWork
  get: HttpGet
  /** Decrypted only here, in main; never logged or sent to the renderer. */
  credentials(): { steamId: string | null; steamKey: string | null; gridKey: string | null }
  clock: { now(): Date }
  wait(ms: number): Promise<void>
  onLibraryChanged(): void
  onError?(error: unknown): void
}

export interface SteamOnline {
  /**
   * GetOwnedGames (DATA_BASE_CONTEXT.md §3.11): adds the games the library is
   * missing; `updatePlaytime` (once per launcher start) also overwrites Steam's
   * play stats of every game. A failure changes nothing.
   */
  syncOwnedGames(options: {
    updatePlaytime: boolean
    scanComplete: boolean
  }): Promise<OwnedSyncOutcome>
  lastSync(): SteamSyncInfo | null
  /** Fetches appdetails for Steam games still without metadata (D-16), one at a time. */
  fetchMissingMetadata(): Promise<void>
  testConnection(kind: 'steam' | 'steamgriddb'): Promise<Result<ConnectionTest>>
}

export function createSteamOnline(deps: SteamOnlineDeps): SteamOnline {
  let last: SteamSyncInfo | null = null
  let metadataRun: Promise<void> | null = null
  const now = (): string => toUtcIso(deps.clock.now())

  const syncOwnedGames: SteamOnline['syncOwnedGames'] = async ({
    updatePlaytime,
    scanComplete
  }) => {
    const failed = (error: string): OwnedSyncOutcome => {
      if (updatePlaytime) last = { status: 'failed', error, games: 0, finishedAt: now() }
      return { added: 0, duplicates: [], error }
    }
    const { steamId, steamKey } = deps.credentials()
    if (!steamId || !steamKey) return failed('not-configured')
    const owned = await fetchOwnedGames(deps.get, steamKey, steamId)
    if (!owned.ok) return failed(owned.error)
    const { added, updated, duplicates } = importOwnedSteamGames(
      deps,
      owned.data.map((g) => ({
        steamAppId: g.appId,
        title: g.title,
        playtimeMinutes: g.playtimeMinutes,
        lastPlayed: g.lastPlayed
      })),
      { scanComplete, overwritePlaytime: updatePlaytime, syncedAt: now() }
    )
    if (updatePlaytime) last = { status: 'ok', error: null, games: updated, finishedAt: now() }
    if (added > 0 || updated > 0) deps.onLibraryChanged()
    return { added, duplicates, error: null }
  }

  const fetchMissing = async (): Promise<void> => {
    let changed = false
    for (const game of gamesMissingMetadata(deps.games.list())) {
      try {
        const result = await fetchAppDetails(deps.get, game.steamAppId as number)
        // Failures keep metadata_fetched_at NULL, so the next scan retries.
        if (result.ok) {
          applySteamMetadata(deps, game, result.data, now())
          changed = true
        }
      } catch (error) {
        deps.onError?.(error)
      }
      await deps.wait(METADATA_INTERVAL_MS)
    }
    if (changed) deps.onLibraryChanged()
  }

  return {
    syncOwnedGames,
    lastSync: () => last,

    fetchMissingMetadata() {
      metadataRun ??= fetchMissing().finally(() => {
        metadataRun = null
      })
      return metadataRun
    },

    async testConnection(kind) {
      const { steamId, steamKey, gridKey } = deps.credentials()
      if (kind === 'steamgriddb') {
        if (!gridKey) return { ok: false, error: { code: 'not-configured' } }
        const result = await testSteamGridDbKey(deps.get, gridKey)
        return result === 'ok'
          ? { ok: true, data: { personaName: null, gamesVisible: true } }
          : { ok: false, error: { code: result } }
      }
      if (!steamId || !steamKey) return { ok: false, error: { code: 'not-configured' } }
      const result = await fetchPlayerSummary(deps.get, steamKey, steamId)
      return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, error: { code: result.error } }
    }
  }
}
