import { BuiltinOrigin, type Game, type InstallState } from '../domain'
import {
  findDuplicates,
  planDiscovery,
  runDiscovery,
  type DuplicateCandidate,
  type IntegrationAdapter
} from './discovery'
import type { GameRepository, SteamPlayStats, UnitOfWork } from './ports'

export interface LibraryRefreshSummary {
  status: 'complete' | 'partial' | 'failed'
  /** Why the scan was partial or failed (e.g. 'steam-not-found'). */
  reason: string | null
  added: number
  /** Known games now confirmed not installed. */
  missing: number
  /** Known games whose state became unknown (unreadable library). */
  unknown: number
  /** Kept for the review step (Phase 6c); never merged here. */
  duplicates: DuplicateCandidate[]
}

const appIdOf = (game: Game): string | null =>
  game.steamAppId === null ? null : String(game.steamAppId)

/**
 * Scans Steam and applies the plan in one transaction (DATA_BASE_CONTEXT.md
 * §3.2): found games are upserted (never touching hidden, beated, playtime
 * or chosen artwork) with their install state; absent games follow the plan;
 * a failed scan changes nothing.
 */
export async function refreshSteamLibrary(
  deps: { games: GameRepository; uow: UnitOfWork },
  adapter: IntegrationAdapter
): Promise<LibraryRefreshSummary> {
  const result = await runDiscovery(adapter)
  const existing = deps.games.list()
  const plan = planDiscovery(BuiltinOrigin.steam, result, existing, appIdOf)
  const known = new Set(existing.map(appIdOf).filter((id) => id !== null))

  deps.uow.transaction(() => {
    for (const game of plan.upserts) {
      const saved = deps.games.upsertSteamGame({
        steamAppId: Number(game.externalId),
        title: game.title
      })
      if (saved.installed !== game.installed) deps.games.setInstalled(saved.id, game.installed)
    }
    for (const change of plan.installChanges) {
      deps.games.setInstalled(change.gameId, change.installed)
    }
  })

  return {
    status: result.status,
    reason: result.status === 'complete' ? null : result.reason,
    added: plan.upserts.filter((g) => !known.has(g.externalId)).length,
    missing: plan.installChanges.filter((c) => c.installed === false).length,
    unknown: plan.installChanges.filter((c) => c.installed === null).length,
    duplicates: plan.duplicates
  }
}

/** One game the account owns; without a title it can only update a stored game. */
export interface OwnedSteamGame extends SteamPlayStats {
  title: string | null
}

export interface OwnedImportSummary {
  added: number
  /** Stored games whose Steam play stats were written. */
  updated: number
  duplicates: DuplicateCandidate[]
}

/** What the owned-games step of a refresh reports; `error` means nothing was changed. */
export interface OwnedSyncOutcome {
  added: number
  duplicates: DuplicateCandidate[]
  error: string | null
}

/**
 * Applies a GetOwnedGames response in one transaction (DATA_BASE_CONTEXT.md
 * §3.11): games the library does not have yet are created, as not installed
 * only after a complete scan, since a failed read never writes "not installed";
 * otherwise as unknown. Stored games keep hidden, beated and their install
 * state. Steam's play stats overwrite every game at startup
 * (`overwritePlaytime`); otherwise only games never synced receive them.
 */
export function importOwnedSteamGames(
  deps: { games: GameRepository; uow: UnitOfWork },
  owned: readonly OwnedSteamGame[],
  options: { scanComplete: boolean; overwritePlaytime: boolean; syncedAt: string }
): OwnedImportSummary {
  const installed: InstallState = options.scanComplete ? false : null
  const existing = deps.games.list()
  const known = new Set(existing.map(appIdOf).filter((id) => id !== null))
  const fresh = owned.flatMap((game) =>
    game.title !== null && !known.has(String(game.steamAppId))
      ? [{ externalId: String(game.steamAppId), title: game.title, installed, game }]
      : []
  )

  const updated = deps.uow.transaction(() => {
    for (const { title, game } of fresh) {
      deps.games.create({
        origin: BuiltinOrigin.steam,
        steamAppId: game.steamAppId,
        title,
        installed
      })
    }
    return deps.games.applySteamPlayStats(owned, options.syncedAt, {
      onlyUnsynced: !options.overwritePlaytime
    })
  })

  return {
    added: fresh.length,
    updated,
    duplicates: findDuplicates(BuiltinOrigin.steam, fresh, existing, appIdOf)
  }
}
