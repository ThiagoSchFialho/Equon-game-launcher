import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type EquonApi } from '../shared/ipc/contract'

// Only named, typed operations are exposed. Never expose ipcRenderer itself.
const api: EquonApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.appGetInfo)
  }
}

contextBridge.exposeInMainWorld('equon', api)
