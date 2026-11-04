import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, IpcEvent, type EquonApi } from '../shared/ipc/contract'

// Only named, typed operations are exposed. Never expose ipcRenderer itself.
const api: EquonApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.appGetInfo),
    getSystemInfo: () => ipcRenderer.invoke(IpcChannel.appGetSystemInfo)
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
    setFlags: (id, flags) => ipcRenderer.invoke(IpcChannel.gamesSetFlags, id, flags),
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
    remove: (key) => ipcRenderer.invoke(IpcChannel.originsRemove, key)
  },
  library: {
    refresh: () => ipcRenderer.invoke(IpcChannel.libraryRefresh),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IpcEvent.libraryChanged, handler)
      return () => ipcRenderer.removeListener(IpcEvent.libraryChanged, handler)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.settingsGet),
    setSteamId: (steamId) => ipcRenderer.invoke(IpcChannel.settingsSetSteamId, steamId),
    setSecret: (kind, value) => ipcRenderer.invoke(IpcChannel.settingsSetSecret, kind, value)
  },
  emulators: {
    list: () => ipcRenderer.invoke(IpcChannel.emulatorsList),
    set: (key, path) => ipcRenderer.invoke(IpcChannel.emulatorsSet, key, path),
    remove: (key) => ipcRenderer.invoke(IpcChannel.emulatorsRemove, key)
  },
  files: {
    list: (path, kind) => ipcRenderer.invoke(IpcChannel.filesList, path, kind),
    pickNative: (kind) => ipcRenderer.invoke(IpcChannel.filesPickNative, kind)
  }
}

contextBridge.exposeInMainWorld('equon', api)
