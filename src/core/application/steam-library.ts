import { BuiltinOrigin, type Game, type InstallState } from '../domain'
import {
  findDuplicates,
  planDiscovery,
  runDiscovery,
  type DiscoveryResult,
  type DuplicateCandidate,
  type IntegrationAdapter
} from './discovery'
import { NotFoundError } from './errors'
import type {
  GameRepository,
  SteamIgnoredRepository,
  SteamIgnoreList,
  SteamPlayStats,
  UnitOfWork,
  UserRepository
} from './ports'

/** What the Steam sync paths need; `ignored` holds the user's exceptions (D-26). */
export interface SteamLibraryDeps {
  games: GameRepository
  uow: UnitOfWork
  ignored?: SteamIgnoreList
}

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

/** Drops the games the user made exceptions of, so a scan never adds them back (D-26). */
async function discoverSteam(
  deps: SteamLibraryDeps,
  adapter: IntegrationAdapter
): Promise<DiscoveryResult> {
  const result = await runDiscovery(adapter)
  const ignored = deps.ignored?.appIds()
  if (result.status === 'failed' || !ignored || ignored.size === 0) return result
  return { ...result, games: result.games.filter((g) => !ignored.has(Number(g.externalId))) }
}

/**
 * Scans Steam and applies the plan in one transaction (DATA_BASE_CONTEXT.md
 * §3.2): found games are upserted (never touching hidden, beated, playtime
 * or chosen artwork) with their install state; absent games follow the plan;
 * a failed scan changes nothing.
 */
export async function refreshSteamLibrary(
  deps: SteamLibraryDeps,
  adapter: IntegrationAdapter
): Promise<LibraryRefreshSummary> {
  const result = await discoverSteam(deps, adapter)
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

export interface LibraryRescanSummary {
  added: number
  /** Whether anything was written. */
  changed: boolean
  duplicates: DuplicateCandidate[]
}

/**
 * The periodic local check: applies only what differs, so a repeat with nothing new
 * writes nothing. Known games keep their title (the full refresh updates it) and all
 * the rules of a scan hold: a failed read changes nothing, a partial one means unknown.
 */
export async function rescanSteamLibrary(
  deps: SteamLibraryDeps,
  adapter: IntegrationAdapter
): Promise<LibraryRescanSummary> {
  const result = await discoverSteam(deps, adapter)
  const existing = deps.games.list()
  const plan = planDiscovery(BuiltinOrigin.steam, result, existing, appIdOf)
  const known = new Map(
    existing.flatMap((g) => (appIdOf(g) === null ? [] : ([[appIdOf(g), g]] as const)))
  )
  const fresh = plan.upserts.filter((game) => !known.has(game.externalId))
  const flipped = plan.upserts.flatMap((game) => {
    const stored = known.get(game.externalId)
    return stored && stored.installed !== game.installed
      ? [{ gameId: stored.id, installed: game.installed }]
      : []
  })
  const changes = [...flipped, ...plan.installChanges]
  if (fresh.length === 0 && changes.length === 0) {
    return { added: 0, changed: false, duplicates: [] }
  }
  deps.uow.transaction(() => {
    for (const game of fresh) {
      const saved = deps.games.upsertSteamGame({
        steamAppId: Number(game.externalId),
        title: game.title
      })
      if (saved.installed !== game.installed) deps.games.setInstalled(saved.id, game.installed)
    }
    for (const change of changes) deps.games.setInstalled(change.gameId, change.installed)
  })
  return { added: fresh.length, changed: true, duplicates: plan.duplicates }
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
  deps: SteamLibraryDeps,
  owned: readonly OwnedSteamGame[],
  options: { scanComplete: boolean; overwritePlaytime: boolean; syncedAt: string }
): OwnedImportSummary {
  const installed: InstallState = options.scanComplete ? false : null
  const existing = deps.games.list()
  const known = new Set(existing.map(appIdOf).filter((id) => id !== null))
  const ignored = deps.ignored?.appIds() ?? new Set<number>()
  const fresh = owned.flatMap((game) =>
    game.title !== null && !known.has(String(game.steamAppId)) && !ignored.has(game.steamAppId)
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

/**
 * Removes a Steam game from the launcher (D-26) in one transaction: the game and everything that
 * cascades from it (sessions, achievements, genres, art rows), with the trophy counters
 * recomputed. The syncs skip it from then on: with `ignore` it is an exception until the user
 * takes it off the list, otherwise until the user's next "Atualizar biblioteca". Nothing changes
 * on the Steam account. NotFoundError for anything but a Steam game.
 */
export function removeSteamGame(
  deps: {
    games: GameRepository
    users: Pick<UserRepository, 'recomputeTrophyCounters'>
    ignored: SteamIgnoredRepository
    uow: UnitOfWork
  },
  gameId: number,
  options: { ignore: boolean; at: string }
): Game {
  return deps.uow.transaction(() => {
    const game = deps.games.getById(gameId)
    if (!game || game.origin !== BuiltinOrigin.steam || game.steamAppId === null) {
      throw new NotFoundError('Game', gameId)
    }
    deps.ignored.add(
      { steamAppId: game.steamAppId, title: game.title, ignoredAt: options.at },
      { permanent: options.ignore }
    )
    deps.games.delete(gameId)
    deps.users.recomputeTrophyCounters()
    return game
  })
}
