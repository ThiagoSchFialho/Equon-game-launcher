import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type EquonApi } from '../shared/ipc/contract'

// Only named, typed operations are exposed. Never expose ipcRenderer itself.
const api: EquonApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.appGetInfo)
  },
  games: {
    list: () => ipcRenderer.invoke(IpcChannel.gamesList),
    get: (id) => ipcRenderer.invoke(IpcChannel.gamesGet, id)
  }
}

contextBridge.exposeInMainWorld('equon', api)
