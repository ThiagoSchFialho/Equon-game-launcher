import { app, ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc/contract'
import { appGetInfoArgs, appInfoSchema } from '../../shared/ipc/schemas'
import { isAppUrl, type AppOrigin } from '../security/navigation'
import { createValidatedHandler } from './validated-handler'

export function registerIpcHandlers(origin: AppOrigin): void {
  const isTrustedSender = (url: string): boolean => isAppUrl(url, origin)

  ipcMain.handle(
    IpcChannel.appGetInfo,
    createValidatedHandler(appGetInfoArgs, appInfoSchema, isTrustedSender, () => ({
      name: app.getName(),
      version: app.getVersion()
    }))
  )
}
