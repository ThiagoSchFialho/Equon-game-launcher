import { app, ipcMain, type BrowserWindow } from 'electron'
import { fetchIgdbFill, searchIgdbGames } from '../../integrations/igdb/games'
import type { IgdbClient, IgdbResult } from '../../integrations/igdb/igdb'
import type { BackgroundActivityTracker } from '../background-activity'
import type { GameRunner, UserRepository } from '../../core/application'
import { IpcChannel, type DriveInfo, type Result, type SystemInfo } from '../../shared/ipc/contract'
import {
  appGetInfoArgs,
  appInfoSchema,
  browserListingSchema,
  editableGameSchema,
  emulatorInfoSchema,
  emulatorListSchema,
  emulatorsRemoveArgs,
  emulatorsSetArgs,
  filesListArgs,
  filesPickNativeArgs,
  gameDetailsResultSchema,
  gameIdArgs,
  gamesCreateArgs,
  gamesGetArgs,
  gamesListArgs,
  gamesSetFlagsArgs,
  gameSummaryListSchema,
  gamesUpdateArgs,
  gamesUpdateSteamArgs,
  nativePickResultSchema,
  noArgs,
  originInfoSchema,
  originListSchema,
  originsCreateArgs,
  originsRemoveArgs,
  originsRenameArgs,
  resultSchema,
  runningIdsSchema,
  libraryRefreshInfoSchema,
  driveListSchema,
  settingsInfoSchema,
  settingsSetEnabledArgs,
  settingsSetSecretArgs,
  settingsSetSteamIdArgs,
  settingsTestConnectionArgs,
  achievementsOverviewSchema,
  achievementSyncStatusSchema,
  backgroundActivitySchema,
  igdbApplyArtworkArgs,
  igdbGameArgs,
  igdbGameSchema,
  igdbSearchArgs,
  igdbSearchResultSchema,
  gameAchievementsResultSchema,
  artworkDraftSchema,
  artworkEditBeginArgs,
  artworkEditFromExternalArgs,
  artworkEditFromFileArgs,
  artworkEditFromGridArgs,
  artworkEditFromSteamArgs,
  artworkEditSaveArgs,
  steamChoiceListSchema,
  gridAssetListSchema,
  artworkKindListSchema,
  artworkSearchArgs,
  duplicateListSchema,
  steamGridDbGameListSchema,
  connectionTestSchema,
  systemInfoSchema
} from '../../shared/ipc/schemas'
import { z } from 'zod'
import { listFiles, pickNative } from '../files/file-service'
import type { ManualGameService } from '../games/manual-game-service'
import type { SettingsService } from '../settings/settings-service'
import type { LaunchCover } from '../launch-cover/launch-cover'
import type { SystemControl } from '../system/system-control'
import { getAchievementsOverview, getGameAchievements } from '../achievements/achievement-queries'
import type { AchievementSync } from '../achievements/achievement-sync'
import type { ArtworkEditor } from '../artwork/artwork-editor'
import type { ArtworkFetcher } from '../artwork/artwork-fetcher'
import type { SteamOnline } from '../steam/steam-online'
import type { SteamInstall } from '../steam/steam-install'
import type { SteamService } from '../steam/steam-service'
import { isAppUrl, type AppOrigin } from '../security/navigation'
import {
  getEditableGame,
  getGameDetails,
  listGameSummaries,
  type GameQueryDeps
} from './game-queries'
import { createValidatedHandler } from './validated-handler'

export interface IpcDeps {
  queries: GameQueryDeps
  service: ManualGameService
  runner: GameRunner
  window: () => BrowserWindow | null
  steam: SteamService
  steamInstall: SteamInstall
  steamOnline: SteamOnline
  artworkFetcher: ArtworkFetcher
  artworkEditor: ArtworkEditor
  achievementSync: AchievementSync
  igdb: IgdbClient
  activity: BackgroundActivityTracker
  users: UserRepository
  /** Where artwork files live; achievement icons are looked up there. */
  artworkCacheDir: string
  settings: SettingsService
  /** Settings › Sobre. */
  systemInfo?: () => SystemInfo
  /** Settings › Armazenamento. */
  listDrives?: () => Promise<Result<DriveInfo[]>>
  /** The system menu (D-21). */
  system?: SystemControl
  /** The image that covers the screen while a game opens (D-22). */
  launchCover?: LaunchCover
}

const idResult = resultSchema(z.strictObject({ id: z.number().int().positive() }))
const nullResult = resultSchema(z.null())
const originResult = resultSchema(originInfoSchema)
const settingsResult = resultSchema(settingsInfoSchema)

/** Expected failures come back as data the screen can explain. */
const igdbResult = async <T>(
  pending: Promise<IgdbResult<T>>
): Promise<{ ok: true; data: T } | { ok: false; error: { code: string } }> => {
  const result = await pending
  return result.ok ? result : { ok: false, error: { code: result.error } }
}

export function registerIpcHandlers(origin: AppOrigin, deps: IpcDeps): void {
  const trusted = (url: string): boolean => isAppUrl(url, origin)
  const { queries, service } = deps

  ipcMain.handle(
    IpcChannel.appGetInfo,
    createValidatedHandler(appGetInfoArgs, appInfoSchema, trusted, () => ({
      name: app.getName(),
      version: app.getVersion()
    }))
  )

  if (deps.systemInfo) {
    const systemInfo = deps.systemInfo
    ipcMain.handle(
      IpcChannel.appGetSystemInfo,
      createValidatedHandler(noArgs, systemInfoSchema, trusted, () => systemInfo())
    )
  }

  if (deps.listDrives) {
    const list = deps.listDrives
    ipcMain.handle(
      IpcChannel.appListDrives,
      createValidatedHandler(noArgs, resultSchema(driveListSchema), trusted, () => list())
    )
  }

  if (deps.system) {
    const system = deps.system
    ipcMain.handle(
      IpcChannel.appIsFullscreen,
      createValidatedHandler(noArgs, z.boolean(), trusted, () => system.isFullscreen())
    )
    ipcMain.handle(
      IpcChannel.appToggleFullscreen,
      createValidatedHandler(noArgs, z.boolean(), trusted, () => system.toggleFullscreen())
    )
    ipcMain.handle(
      IpcChannel.appClaimFocus,
      createValidatedHandler(noArgs, z.boolean(), trusted, () => system.claimFocus())
    )
    ipcMain.handle(
      IpcChannel.appShutdown,
      createValidatedHandler(noArgs, nullResult, trusted, () => system.shutdown())
    )
    ipcMain.handle(
      IpcChannel.appQuit,
      createValidatedHandler(noArgs, z.null(), trusted, () => {
        system.quit()
        return null
      })
    )
  }

  // Library and settings
  ipcMain.handle(
    IpcChannel.activityCurrent,
    createValidatedHandler(noArgs, backgroundActivitySchema, trusted, () => deps.activity.current())
  )
  ipcMain.handle(
    IpcChannel.libraryRefresh,
    createValidatedHandler(noArgs, libraryRefreshInfoSchema, trusted, () => deps.steam.refresh())
  )
  ipcMain.handle(
    IpcChannel.settingsGet,
    createValidatedHandler(noArgs, settingsInfoSchema, trusted, () => deps.settings.get())
  )
  ipcMain.handle(
    IpcChannel.settingsSetSteamId,
    createValidatedHandler(settingsSetSteamIdArgs, settingsResult, trusted, (steamId) =>
      deps.settings.setSteamId(steamId)
    )
  )
  ipcMain.handle(
    IpcChannel.settingsSetStartFullscreen,
    createValidatedHandler(settingsSetEnabledArgs, settingsResult, trusted, (enabled) =>
      deps.settings.setStartFullscreen(enabled)
    )
  )
  ipcMain.handle(
    IpcChannel.settingsSetOpenAtLogin,
    createValidatedHandler(settingsSetEnabledArgs, settingsResult, trusted, (enabled) =>
      deps.settings.setOpenAtLogin(enabled)
    )
  )
  ipcMain.handle(
    IpcChannel.settingsSetSecret,
    createValidatedHandler(settingsSetSecretArgs, settingsResult, trusted, (kind, value) => {
      const result = deps.settings.setSecret(kind, value)
      // A new SteamGridDB key fills the art that was missing, even for games already
      // tried: until now SteamGridDB may never have been asked about them.
      if (result.ok && kind === 'steamgriddb-api-key' && value !== null) {
        void deps.artworkFetcher.fetchMissing({ retry: true })
      }
      return result
    })
  )

  // Achievements
  const achievementDeps = {
    ...queries,
    users: deps.users,
    isStale: (id: number) => deps.achievementSync.isStale(id),
    cacheDir: deps.artworkCacheDir
  }
  ipcMain.handle(
    IpcChannel.achievementsOverview,
    createValidatedHandler(noArgs, achievementsOverviewSchema, trusted, () =>
      getAchievementsOverview(achievementDeps)
    )
  )
  ipcMain.handle(
    IpcChannel.achievementsGame,
    createValidatedHandler(gameIdArgs, gameAchievementsResultSchema, trusted, (id) =>
      getGameAchievements(achievementDeps, id)
    )
  )
  ipcMain.handle(
    IpcChannel.achievementsSyncAll,
    createValidatedHandler(noArgs, achievementSyncStatusSchema, trusted, () =>
      deps.achievementSync.syncAll()
    )
  )
  ipcMain.handle(
    IpcChannel.achievementsStatus,
    createValidatedHandler(noArgs, achievementSyncStatusSchema, trusted, () =>
      deps.achievementSync.status()
    )
  )
  ipcMain.handle(
    IpcChannel.achievementsEnsureIcons,
    createValidatedHandler(gameIdArgs, z.undefined(), trusted, async (id) => {
      await deps.achievementSync.ensureIcons(id)
      return undefined
    })
  )

  ipcMain.handle(
    IpcChannel.libraryDuplicates,
    createValidatedHandler(noArgs, duplicateListSchema, trusted, () => deps.steam.duplicates())
  )
  ipcMain.handle(
    IpcChannel.libraryDismissDuplicate,
    createValidatedHandler(gameIdArgs, z.undefined(), trusted, (manualGameId) => {
      deps.steam.dismissDuplicate(manualGameId)
      return undefined
    })
  )
  ipcMain.handle(
    IpcChannel.igdbSearch,
    createValidatedHandler(igdbSearchArgs, resultSchema(igdbSearchResultSchema), trusted, (term) =>
      igdbResult(searchIgdbGames(deps.igdb, term))
    )
  )
  ipcMain.handle(
    IpcChannel.igdbGame,
    createValidatedHandler(igdbGameArgs, resultSchema(igdbGameSchema), trusted, (gameId) =>
      igdbResult(fetchIgdbFill(deps.igdb, gameId))
    )
  )
  ipcMain.handle(
    IpcChannel.igdbApplyArtwork,
    createValidatedHandler(
      igdbApplyArtworkArgs,
      resultSchema(artworkKindListSchema),
      trusted,
      (gameId, igdbGameId) => deps.artworkFetcher.applyIgdb(gameId, igdbGameId)
    )
  )
  ipcMain.handle(
    IpcChannel.artworkSearch,
    createValidatedHandler(
      artworkSearchArgs,
      resultSchema(steamGridDbGameListSchema),
      trusted,
      (term) => deps.artworkFetcher.search(term)
    )
  )
  ipcMain.handle(
    IpcChannel.artworkEditBegin,
    createValidatedHandler(artworkEditBeginArgs, z.undefined(), trusted, (gameId) => {
      deps.artworkEditor.begin(gameId)
      return undefined
    })
  )
  ipcMain.handle(
    IpcChannel.artworkEditEnd,
    createValidatedHandler(noArgs, z.undefined(), trusted, () => {
      deps.artworkEditor.end()
      return undefined
    })
  )
  ipcMain.handle(
    IpcChannel.artworkEditFromFile,
    createValidatedHandler(
      artworkEditFromFileArgs,
      resultSchema(artworkDraftSchema),
      trusted,
      (gameId, kind, path) => deps.artworkEditor.fromFile(gameId, kind, path)
    )
  )
  ipcMain.handle(
    IpcChannel.artworkEditFromIgdb,
    createValidatedHandler(
      artworkEditFromExternalArgs,
      resultSchema(artworkDraftSchema),
      trusted,
      (gameId, kind, igdbGameId) => deps.artworkEditor.fromIgdb(gameId, kind, igdbGameId)
    )
  )
  ipcMain.handle(
    IpcChannel.artworkEditGridAssets,
    createValidatedHandler(
      artworkEditFromExternalArgs,
      resultSchema(gridAssetListSchema),
      trusted,
      (gameId, kind, gridGameId) => deps.artworkEditor.gridAssets(gameId, kind, gridGameId)
    )
  )
  ipcMain.handle(
    IpcChannel.artworkEditFromGrid,
    createValidatedHandler(
      artworkEditFromGridArgs,
      resultSchema(artworkDraftSchema),
      trusted,
      (gameId, kind, assetId) => deps.artworkEditor.fromGrid(gameId, kind, assetId)
    )
  )
  ipcMain.handle(
    IpcChannel.artworkEditSteamChoices,
    createValidatedHandler(
      artworkEditBeginArgs,
      resultSchema(steamChoiceListSchema),
      trusted,
      (gameId) => deps.artworkEditor.steamChoices(gameId)
    )
  )
  ipcMain.handle(
    IpcChannel.artworkEditFromSteam,
    createValidatedHandler(
      artworkEditFromSteamArgs,
      resultSchema(artworkDraftSchema),
      trusted,
      (gameId, kind, choiceId) => deps.artworkEditor.fromSteam(gameId, kind, choiceId)
    )
  )
  ipcMain.handle(
    IpcChannel.artworkEditSave,
    createValidatedHandler(artworkEditSaveArgs, resultSchema(z.null()), trusted, (gameId, remove) =>
      deps.artworkEditor.save(gameId, remove)
    )
  )
  ipcMain.handle(
    IpcChannel.settingsTestConnection,
    createValidatedHandler(
      settingsTestConnectionArgs,
      resultSchema(connectionTestSchema),
      trusted,
      (kind) => deps.steamOnline.testConnection(kind)
    )
  )

  // Games
  ipcMain.handle(
    IpcChannel.gamesList,
    createValidatedHandler(gamesListArgs, gameSummaryListSchema, trusted, () =>
      listGameSummaries(queries)
    )
  )
  ipcMain.handle(
    IpcChannel.gamesGet,
    createValidatedHandler(gamesGetArgs, gameDetailsResultSchema, trusted, async (id) => {
      await deps.steam.refreshGame(id)
      return getGameDetails(queries, id)
    })
  )
  ipcMain.handle(
    IpcChannel.gamesGetEditable,
    createValidatedHandler(gameIdArgs, editableGameSchema, trusted, (id) =>
      getEditableGame(queries, id)
    )
  )
  ipcMain.handle(
    IpcChannel.gamesCreate,
    createValidatedHandler(gamesCreateArgs, idResult, trusted, (form) => service.create(form))
  )
  ipcMain.handle(
    IpcChannel.gamesUpdate,
    createValidatedHandler(gamesUpdateArgs, idResult, trusted, (id, form) =>
      service.update(id, form)
    )
  )
  ipcMain.handle(
    IpcChannel.gamesUpdateSteam,
    createValidatedHandler(gamesUpdateSteamArgs, idResult, trusted, (id, form) =>
      service.updateSteam(id, form)
    )
  )
  ipcMain.handle(
    IpcChannel.gamesRemove,
    createValidatedHandler(gameIdArgs, nullResult, trusted, (id) => service.remove(id))
  )
  ipcMain.handle(
    IpcChannel.gamesLaunch,
    createValidatedHandler(gameIdArgs, nullResult, trusted, (id) =>
      deps.launchCover ? deps.launchCover.run(id, () => service.launch(id)) : service.launch(id)
    )
  )
  ipcMain.handle(
    IpcChannel.gamesInstallSteam,
    createValidatedHandler(gameIdArgs, nullResult, trusted, (id) => deps.steamInstall.install(id))
  )
  ipcMain.handle(
    IpcChannel.gamesUninstallSteam,
    createValidatedHandler(gameIdArgs, nullResult, trusted, (id) => deps.steamInstall.uninstall(id))
  )
  ipcMain.handle(
    IpcChannel.gamesCancelLaunchCover,
    createValidatedHandler(noArgs, z.undefined(), trusted, () => {
      deps.launchCover?.cancel()
      return undefined
    })
  )
  ipcMain.handle(
    IpcChannel.gamesSetFlags,
    createValidatedHandler(gamesSetFlagsArgs, nullResult, trusted, (id, flags) =>
      service.setFlags(id, flags)
    )
  )
  ipcMain.handle(
    IpcChannel.gamesRunning,
    createValidatedHandler(noArgs, runningIdsSchema, trusted, () => deps.runner.runningGameIds())
  )

  // Origins
  ipcMain.handle(
    IpcChannel.originsList,
    createValidatedHandler(noArgs, originListSchema, trusted, () => queries.origins.list())
  )
  ipcMain.handle(
    IpcChannel.originsCreate,
    createValidatedHandler(originsCreateArgs, originResult, trusted, (name) =>
      service.createOrigin(name)
    )
  )
  ipcMain.handle(
    IpcChannel.originsRename,
    createValidatedHandler(originsRenameArgs, originResult, trusted, (key, name) =>
      service.renameOrigin(key, name)
    )
  )
  ipcMain.handle(
    IpcChannel.originsRemove,
    createValidatedHandler(originsRemoveArgs, nullResult, trusted, (key) =>
      service.removeOrigin(key)
    )
  )

  // Emulators
  ipcMain.handle(
    IpcChannel.emulatorsList,
    createValidatedHandler(noArgs, emulatorListSchema, trusted, () => service.listEmulators())
  )
  ipcMain.handle(
    IpcChannel.emulatorsSet,
    createValidatedHandler(
      emulatorsSetArgs,
      resultSchema(emulatorInfoSchema),
      trusted,
      (key, path) => service.setEmulator(key, path)
    )
  )
  ipcMain.handle(
    IpcChannel.emulatorsRemove,
    createValidatedHandler(emulatorsRemoveArgs, nullResult, trusted, (key) =>
      service.removeEmulator(key)
    )
  )

  // Files
  ipcMain.handle(
    IpcChannel.filesList,
    createValidatedHandler(
      filesListArgs,
      resultSchema(browserListingSchema),
      trusted,
      (path, kind) => listFiles(path, kind)
    )
  )
  ipcMain.handle(
    IpcChannel.filesPickNative,
    createValidatedHandler(filesPickNativeArgs, nativePickResultSchema, trusted, (kind) =>
      pickNative(deps.window(), kind)
    )
  )
}
