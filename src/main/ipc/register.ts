import { app, ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc/contract'
import {
  appGetInfoArgs,
  appInfoSchema,
  gameDetailsResultSchema,
  gamesGetArgs,
  gamesListArgs,
  gameSummaryListSchema
} from '../../shared/ipc/schemas'
import { isAppUrl, type AppOrigin } from '../security/navigation'
import { getGameDetails, listGameSummaries, type GameQueryDeps } from './game-queries'
import { createValidatedHandler } from './validated-handler'

export function registerIpcHandlers(origin: AppOrigin, deps: GameQueryDeps): void {
  const isTrustedSender = (url: string): boolean => isAppUrl(url, origin)

  ipcMain.handle(
    IpcChannel.appGetInfo,
    createValidatedHandler(appGetInfoArgs, appInfoSchema, isTrustedSender, () => ({
      name: app.getName(),
      version: app.getVersion()
    }))
  )

  ipcMain.handle(
    IpcChannel.gamesList,
    createValidatedHandler(gamesListArgs, gameSummaryListSchema, isTrustedSender, () =>
      listGameSummaries(deps)
    )
  )

  ipcMain.handle(
    IpcChannel.gamesGet,
    createValidatedHandler(gamesGetArgs, gameDetailsResultSchema, isTrustedSender, (id) =>
      getGameDetails(deps, id)
    )
  )
}
