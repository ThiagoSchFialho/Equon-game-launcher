import { BuiltinOrigin, type Game } from '../domain'
import type { GameRepository, GenreRepository, UnitOfWork } from './ports'

/** Store metadata shown on the game page (owner decision, Phase 6b). */
export interface SteamMetadata {
  description: string | null
  developer: string | null
  requiredAge: string | null
  genres: string[]
}

/** Steam games whose metadata was never saved (or whose last fetch failed), D-16. */
export function gamesMissingMetadata(games: readonly Game[]): Game[] {
  return games.filter(
    (g) => g.origin === BuiltinOrigin.steam && g.steamAppId !== null && g.metadataFetchedAt === null
  )
}

/**
 * Saves a valid `appdetails` response in one transaction and marks the game
 * as fetched. Empty values never replace stored ones (the upsert keeps them),
 * and title, flags and playtime are left alone.
 */
export function applySteamMetadata(
  deps: { games: GameRepository; genres: GenreRepository; uow: UnitOfWork },
  game: Game,
  metadata: SteamMetadata,
  fetchedAt: string
): Game {
  if (game.steamAppId === null) throw new Error('Not a Steam game')
  const appId = game.steamAppId
  return deps.uow.transaction(() => {
    const saved = deps.games.upsertSteamGame({
      steamAppId: appId,
      title: game.title,
      description: metadata.description,
      developer: metadata.developer,
      requiredAge: metadata.requiredAge,
      metadataFetchedAt: fetchedAt
    })
    if (metadata.genres.length > 0) deps.genres.setGameGenres(saved.id, metadata.genres)
    return saved
  })
}
