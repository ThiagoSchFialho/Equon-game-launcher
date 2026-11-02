import type {
  AchievementRepository,
  ArtworkRepository,
  GameRepository,
  GenreRepository,
  OriginRepository
} from '../../core/application'
import type { Game } from '../../core/domain'
import type { GameDetails, GameSummary } from '../../shared/ipc/contract'

export interface GameQueryDeps {
  games: GameRepository
  origins: OriginRepository
  artwork: ArtworkRepository
  genres: GenreRepository
  achievements: AchievementRepository
}

function toSummary(
  game: Game,
  originNames: Map<string, string>,
  artworkKinds: Map<number, GameSummary['artwork']>
): GameSummary {
  return {
    id: game.id,
    title: game.title,
    origin: game.origin,
    originName: originNames.get(game.origin) ?? game.origin,
    installed: game.installed,
    playtime: game.playtime,
    timeLastPlayed: game.timeLastPlayed,
    beated: game.beated,
    artwork: artworkKinds.get(game.id) ?? []
  }
}

const originNameMap = (deps: GameQueryDeps): Map<string, string> =>
  new Map(deps.origins.list().map((o) => [o.key, o.name]))

/** Visible games only; hidden games are excluded until the Library filter exists (Phase 5). */
export function listGameSummaries(deps: GameQueryDeps): GameSummary[] {
  const names = originNameMap(deps)
  const kinds = deps.artwork.listKinds()
  return deps.games
    .list()
    .filter((g) => !g.hidden)
    .map((g) => toSummary(g, names, kinds))
}

export function getGameDetails(deps: GameQueryDeps, id: number): GameDetails | null {
  const game = deps.games.getById(id)
  if (!game) return null
  const progress = deps.achievements.progress(id)
  return {
    ...toSummary(game, originNameMap(deps), deps.artwork.listKinds()),
    description: game.description,
    developer: game.developer,
    releaseDate: game.releaseDate,
    requiredAge: game.requiredAge,
    genres: deps.genres.listForGame(id).map((g) => g.name),
    achievements:
      progress.total > 0
        ? { total: progress.total, unlocked: progress.unlocked, platinum: progress.platinum }
        : null
  }
}
