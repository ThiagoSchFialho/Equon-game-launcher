import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, IpcEvent, type EquonApi } from '../shared/ipc/contract'

// Only named, typed operations are exposed. Never expose ipcRenderer itself.
const api: EquonApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.appGetInfo)
  },
  games: {
    list: () => ipcRenderer.invoke(IpcChannel.gamesList),
    get: (id) => ipcRenderer.invoke(IpcChannel.gamesGet, id),
    getEditable: (id) => ipcRenderer.invoke(IpcChannel.gamesGetEditable, id),
    create: (form) => ipcRenderer.invoke(IpcChannel.gamesCreate, form),
    update: (id, form) => ipcRenderer.invoke(IpcChannel.gamesUpdate, id, form),
    remove: (id) => ipcRenderer.invoke(IpcChannel.gamesRemove, id),
    launch: (id) => ipcRenderer.invoke(IpcChannel.gamesLaunch, id),
    running: () => ipcRenderer.invoke(IpcChannel.gamesRunning),
    onRunningChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, ids: unknown): void => {
        if (Array.isArray(ids) && ids.every((id) => Number.isInteger(id))) listener(ids)
      }
      ipcRenderer.on(IpcEvent.gamesRunningChanged, handler)
      return () => ipcRenderer.removeListener(IpcEvent.gamesRunningChanged, handler)
    }
  },
  origins: {
    list: () => ipcRenderer.invoke(IpcChannel.originsList),
    create: (name) => ipcRenderer.invoke(IpcChannel.originsCreate, name),
    rename: (key, name) => ipcRenderer.invoke(IpcChannel.originsRename, key, name),
    remove: (key) => ipcRenderer.invoke(IpcChannel.originsRemove, key),
    setDefaults: (key, exe, args) =>
      ipcRenderer.invoke(IpcChannel.originsSetDefaults, key, exe, args)
  },
  files: {
    list: (path, kind) => ipcRenderer.invoke(IpcChannel.filesList, path, kind),
    pickNative: (kind) => ipcRenderer.invoke(IpcChannel.filesPickNative, kind)
  }
}

contextBridge.exposeInMainWorld('equon', api)
