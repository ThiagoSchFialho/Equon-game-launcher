import { titleMatchKey, type Game, type InstallState, type OriginKey } from '../domain'

/**
 * Normalized discovery contract (ARCHITECTURE.md §6, ROADMAP Phase 5). Every
 * automatic integration (only Steam, Phase 6) implements one adapter that
 * reports what it found in this shape; the coordinator below turns a result
 * into a plan without ever guessing on failures.
 */

/** What an adapter can provide; the UI and use cases only rely on declared capabilities. */
export interface DiscoveryCapabilities {
  installState: boolean
  launch: boolean
  playtime: boolean
  achievements: boolean
  metadata: boolean
}

export interface DiscoveredGame {
  /** Stable id inside the source (Steam: the App ID as text). */
  externalId: string
  title: string
  /** null = the adapter could not tell. */
  installed: InstallState
}

/**
 * `complete`: every location was read, so a known game that is absent is
 * confirmed not installed. `partial`: some locations failed; absent games
 * become unknown. `failed`: nothing usable; nothing changes.
 */
export type DiscoveryResult =
  | { status: 'complete'; games: DiscoveredGame[] }
  | { status: 'partial'; games: DiscoveredGame[]; reason: string }
  | { status: 'failed'; reason: string }

export interface IntegrationAdapter {
  /** Origin of the games this adapter owns. */
  readonly source: OriginKey
  readonly capabilities: DiscoveryCapabilities
  discover(): Promise<DiscoveryResult>
}

/** A discovered game whose title matches a game of another origin; never merged automatically. */
export interface DuplicateCandidate {
  discovered: DiscoveredGame
  existingGameId: number
}

export interface DiscoveryPlan {
  /** Discovered games to insert or update (idempotent upserts that never touch hidden/beated). */
  upserts: DiscoveredGame[]
  /** Known games of the source that were not found, with their new install state. */
  installChanges: { gameId: number; installed: InstallState }[]
  duplicates: DuplicateCandidate[]
}

const EMPTY_PLAN: DiscoveryPlan = { upserts: [], installChanges: [], duplicates: [] }

/** Runs one adapter; a throwing integration becomes a failed result and never breaks the others. */
export async function runDiscovery(adapter: IntegrationAdapter): Promise<DiscoveryResult> {
  try {
    return await adapter.discover()
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Plans what a discovery result changes. `externalIdOf` maps a known game of
 * the source to its external id (Steam: its App ID).
 */
export function planDiscovery(
  source: OriginKey,
  result: DiscoveryResult,
  existing: readonly Game[],
  externalIdOf: (game: Game) => string | null
): DiscoveryPlan {
  if (result.status === 'failed') return EMPTY_PLAN

  const found = new Set(result.games.map((g) => g.externalId))
  const known = new Set<string>()
  const installChanges: DiscoveryPlan['installChanges'] = []
  const others = new Map<string, number>()

  for (const game of existing) {
    if (game.origin !== source) {
      const key = titleMatchKey(game.title)
      if (key !== '' && !others.has(key)) others.set(key, game.id)
      continue
    }
    const externalId = externalIdOf(game)
    if (externalId === null) continue
    known.add(externalId)
    if (found.has(externalId)) continue
    // A failed read never writes "not installed" (DATA_BASE_CONTEXT.md §3.2).
    const installed = result.status === 'complete' ? false : null
    if (game.installed !== installed) installChanges.push({ gameId: game.id, installed })
  }

  const duplicates: DuplicateCandidate[] = []
  for (const discovered of result.games) {
    if (known.has(discovered.externalId)) continue
    const match = others.get(titleMatchKey(discovered.title))
    if (match !== undefined) duplicates.push({ discovered, existingGameId: match })
  }

  return { upserts: result.games, installChanges, duplicates }
}
