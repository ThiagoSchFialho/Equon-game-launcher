import {
  refreshManualInstallStates,
  type AchievementRepository,
  type ArtworkRepository,
  type FileInspector,
  type GameRepository,
  type GenreRepository,
  type LaunchConfigRepository,
  type OriginRepository
} from '../../core/application'
import { BuiltinOrigin, type Game } from '../../core/domain'
import type { EditableGame, GameDetails, GameSummary } from '../../shared/ipc/contract'

export interface GameQueryDeps {
  games: GameRepository
  origins: OriginRepository
  artwork: ArtworkRepository
  genres: GenreRepository
  achievements: AchievementRepository
  configs: LaunchConfigRepository
  inspector: FileInspector
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

/**
 * Visible games only; hidden games are excluded until the Library filter
 * exists (Phase 5). Manual install states are re-checked first (§3.2).
 */
export function listGameSummaries(deps: GameQueryDeps): GameSummary[] {
  refreshManualInstallStates(deps, deps.inspector)
  const names = originNameMap(deps)
  const kinds = deps.artwork.listKinds()
  return deps.games
    .list()
    .filter((g) => !g.hidden)
    .map((g) => toSummary(g, names, kinds))
}

export function getGameDetails(deps: GameQueryDeps, id: number): GameDetails | null {
  refreshManualInstallStates(deps, deps.inspector)
  const game = deps.games.getById(id)
  if (!game) return null
  const progress = deps.achievements.progress(id)
  const editable = game.origin !== BuiltinOrigin.steam
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
        : null,
    editable,
    // Steam launching arrives in Phase 6.
    launchable: editable && game.installed === true && deps.configs.get(id) !== null
  }
}

/** The add/edit form values of a non-Steam game, or null. */
export function getEditableGame(deps: GameQueryDeps, id: number): EditableGame | null {
  const game = deps.games.getById(id)
  if (!game || game.origin === BuiltinOrigin.steam) return null
  const config = deps.configs.get(id)
  return {
    id,
    form: {
      title: game.title,
      description: game.description,
      developer: game.developer,
      releaseDate: game.releaseDate,
      requiredAge: game.requiredAge,
      playtimeOffset: game.playtimeOffset,
      origin: game.origin,
      executablePath: config?.executablePath ?? '',
      arguments: config?.arguments ?? [],
      workingDirectory: config?.workingDirectory ?? null,
      backgroundPath: null
    },
    hasBackground: deps.artwork.get(id, 'background') !== null
  }
}
