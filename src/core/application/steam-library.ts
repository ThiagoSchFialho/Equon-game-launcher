import { BuiltinOrigin, type Game } from '../domain'
import {
  planDiscovery,
  runDiscovery,
  type DuplicateCandidate,
  type IntegrationAdapter
} from './discovery'
import type { GameRepository, UnitOfWork } from './ports'

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
