import {
  refreshManualInstallStates,
  type AchievementRepository,
  type ArtworkRepository,
  type EmulatorRepository,
  type FileInspector,
  type GameRepository,
  type GenreRepository,
  type LaunchConfigRepository,
  type OriginRepository
} from '../../core/application'
import {
  BuiltinOrigin,
  EMULATORS,
  emulatorForOrigin,
  isShortcutName,
  type Game,
  type LaunchConfig,
  type SteamLiveState
} from '../../core/domain'
import type { EditableGame, GameDetails, GameSummary, LaunchIssue } from '../../shared/ipc/contract'

export interface GameQueryDeps {
  games: GameRepository
  origins: OriginRepository
  artwork: ArtworkRepository
  genres: GenreRepository
  achievements: AchievementRepository
  configs: LaunchConfigRepository
  emulators: EmulatorRepository
  inspector: FileInspector
  /** Live manifest state of a Steam game (D-12); never stored. */
  steamLiveState(appId: number): SteamLiveState
}

/** Why Play cannot be offered for a game, or null (DATA_BASE_CONTEXT.md §3.2, §3.12). */
function launchIssueOf(
  deps: GameQueryDeps,
  game: Game,
  config: LaunchConfig | null
): LaunchIssue | null {
  if (game.origin === BuiltinOrigin.steam) {
    if (game.installed === null) return 'install-unknown'
    if (game.installed === false || game.steamAppId === null) return 'not-installed'
    const live = deps.steamLiveState(game.steamAppId)
    return live === 'updating' || live === 'paused' ? 'steam-busy' : null
  }
  if (!config) return 'no-config'
  if (game.installed === null) return 'install-unknown'
  if (game.installed === false) return 'not-installed'
  if (config.romPath !== null) {
    const emulator = emulatorForOrigin(game.origin) ?? EMULATORS.yuzu
    const configured = deps.emulators.get(emulator.key)
    if (!configured || deps.inspector.stateOf(configured.executablePath) !== 'file') {
      return 'emulator-missing'
    }
  }
  return null
}

function toSummary(
  game: Game,
  originNames: Map<string, string>,
  artworkKinds: Map<number, GameSummary['artwork']>,
  artworkVersions: Map<number, string>,
  achievements: AchievementRepository
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
    hidden: game.hidden,
    artwork: artworkKinds.get(game.id) ?? [],
    artworkVersion: artworkVersions.get(game.id) ?? null,
    achievementPercent: achievements.progress(game.id).percent
  }
}

const originNameMap = (deps: GameQueryDeps): Map<string, string> =>
  new Map(deps.origins.list().map((o) => [o.key, o.name]))

/**
 * Every game, hidden ones included: Home and Library decide what to show.
 * Manual install states are re-checked first (§3.2).
 */
export function listGameSummaries(deps: GameQueryDeps): GameSummary[] {
  refreshManualInstallStates(deps, deps.inspector)
  const names = originNameMap(deps)
  const kinds = deps.artwork.listKinds()
  const versions = deps.artwork.listVersions()
  return deps.games.list().map((g) => toSummary(g, names, kinds, versions, deps.achievements))
}

export function getGameDetails(deps: GameQueryDeps, id: number): GameDetails | null {
  refreshManualInstallStates(deps, deps.inspector)
  const game = deps.games.getById(id)
  if (!game) return null
  const progress = deps.achievements.progress(id)
  const config = deps.configs.get(id)
  const launchIssue = launchIssueOf(deps, game, config)
  return {
    ...toSummary(
      game,
      originNameMap(deps),
      deps.artwork.listKinds(),
      deps.artwork.listVersions(),
      deps.achievements
    ),
    description: game.description,
    developer: game.developer,
    releaseDate: game.releaseDate,
    requiredAge: game.requiredAge,
    genres: deps.genres.listForGame(id).map((g) => g.name),
    achievements:
      progress.total > 0
        ? { total: progress.total, unlocked: progress.unlocked, platinum: progress.platinum }
        : null,
    editable: game.origin !== BuiltinOrigin.steam,
    launchable: launchIssue === null,
    launchIssue,
    // .url shortcuts hand the game to a store launcher: no process to observe.
    tracksTime: !(config?.executablePath && isShortcutName(config.executablePath))
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
      romPath: config?.romPath ?? null,
      arguments: config?.arguments ?? [],
      workingDirectory: config?.workingDirectory ?? null
    }
  }
}
