import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannel,
  IpcEvent,
  type BackgroundActivity,
  type EquonApi
} from '../shared/ipc/contract'

// Only named, typed operations are exposed. Never expose ipcRenderer itself.
const api: EquonApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.appGetInfo),
    getSystemInfo: () => ipcRenderer.invoke(IpcChannel.appGetSystemInfo),
    listDrives: () => ipcRenderer.invoke(IpcChannel.appListDrives),
    isFullscreen: () => ipcRenderer.invoke(IpcChannel.appIsFullscreen),
    toggleFullscreen: () => ipcRenderer.invoke(IpcChannel.appToggleFullscreen),
    claimFocus: () => ipcRenderer.invoke(IpcChannel.appClaimFocus),
    shutdown: () => ipcRenderer.invoke(IpcChannel.appShutdown),
    quit: () => ipcRenderer.invoke(IpcChannel.appQuit)
  },
  games: {
    list: () => ipcRenderer.invoke(IpcChannel.gamesList),
    get: (id) => ipcRenderer.invoke(IpcChannel.gamesGet, id),
    getEditable: (id) => ipcRenderer.invoke(IpcChannel.gamesGetEditable, id),
    create: (form) => ipcRenderer.invoke(IpcChannel.gamesCreate, form),
    update: (id, form) => ipcRenderer.invoke(IpcChannel.gamesUpdate, id, form),
    updateSteam: (id, form) => ipcRenderer.invoke(IpcChannel.gamesUpdateSteam, id, form),
    remove: (id) => ipcRenderer.invoke(IpcChannel.gamesRemove, id),
    launch: (id) => ipcRenderer.invoke(IpcChannel.gamesLaunch, id),
    installSteam: (id) => ipcRenderer.invoke(IpcChannel.gamesInstallSteam, id),
    uninstallSteam: (id) => ipcRenderer.invoke(IpcChannel.gamesUninstallSteam, id),
    running: () => ipcRenderer.invoke(IpcChannel.gamesRunning),
    setFlags: (id, flags) => ipcRenderer.invoke(IpcChannel.gamesSetFlags, id, flags),
    onRunningChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, ids: unknown): void => {
        if (Array.isArray(ids) && ids.every((id) => Number.isInteger(id))) listener(ids)
      }
      ipcRenderer.on(IpcEvent.gamesRunningChanged, handler)
      return () => ipcRenderer.removeListener(IpcEvent.gamesRunningChanged, handler)
    },
    cancelLaunchCover: () => ipcRenderer.invoke(IpcChannel.gamesCancelLaunchCover),
    onLaunchCoverChanged: (listener) => {
      const handler = (_event: IpcRendererEvent, active: unknown): void => {
        if (typeof active === 'boolean') listener(active)
      }
      ipcRenderer.on(IpcEvent.launchCoverChanged, handler)
      return () => ipcRenderer.removeListener(IpcEvent.launchCoverChanged, handler)
    }
  },
  origins: {
    list: () => ipcRenderer.invoke(IpcChannel.originsList),
    create: (name) => ipcRenderer.invoke(IpcChannel.originsCreate, name),
    rename: (key, name) => ipcRenderer.invoke(IpcChannel.originsRename, key, name),
    remove: (key) => ipcRenderer.invoke(IpcChannel.originsRemove, key)
  },
  igdb: {
    search: (term) => ipcRenderer.invoke(IpcChannel.igdbSearch, term),
    game: (id) => ipcRenderer.invoke(IpcChannel.igdbGame, id),
    applyArtwork: (gameId, igdbGameId) =>
      ipcRenderer.invoke(IpcChannel.igdbApplyArtwork, gameId, igdbGameId)
  },
  activity: {
    current: () => ipcRenderer.invoke(IpcChannel.activityCurrent),
    onChanged: (listener) => {
      const handler = (_: IpcRendererEvent, activity: BackgroundActivity | null): void =>
        listener(activity)
      ipcRenderer.on(IpcEvent.activityChanged, handler)
      return () => ipcRenderer.removeListener(IpcEvent.activityChanged, handler)
    }
  },
  library: {
    refresh: () => ipcRenderer.invoke(IpcChannel.libraryRefresh),
    duplicates: () => ipcRenderer.invoke(IpcChannel.libraryDuplicates),
    dismissDuplicate: (manualGameId) =>
      ipcRenderer.invoke(IpcChannel.libraryDismissDuplicate, manualGameId),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IpcEvent.libraryChanged, handler)
      return () => ipcRenderer.removeListener(IpcEvent.libraryChanged, handler)
    }
  },
  achievements: {
    overview: () => ipcRenderer.invoke(IpcChannel.achievementsOverview),
    game: (id) => ipcRenderer.invoke(IpcChannel.achievementsGame, id),
    syncAll: () => ipcRenderer.invoke(IpcChannel.achievementsSyncAll),
    status: () => ipcRenderer.invoke(IpcChannel.achievementsStatus),
    ensureIcons: (id) => ipcRenderer.invoke(IpcChannel.achievementsEnsureIcons, id),
    onChanged: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IpcEvent.achievementsChanged, handler)
      return () => ipcRenderer.removeListener(IpcEvent.achievementsChanged, handler)
    }
  },
  artwork: {
    search: (term) => ipcRenderer.invoke(IpcChannel.artworkSearch, term)
  },
  artworkEdit: {
    begin: (gameId) => ipcRenderer.invoke(IpcChannel.artworkEditBegin, gameId),
    end: () => ipcRenderer.invoke(IpcChannel.artworkEditEnd),
    fromFile: (gameId, kind, path) =>
      ipcRenderer.invoke(IpcChannel.artworkEditFromFile, gameId, kind, path),
    fromIgdb: (gameId, kind, igdbGameId) =>
      ipcRenderer.invoke(IpcChannel.artworkEditFromIgdb, gameId, kind, igdbGameId),
    gridAssets: (gameId, kind, gridGameId) =>
      ipcRenderer.invoke(IpcChannel.artworkEditGridAssets, gameId, kind, gridGameId),
    fromGrid: (gameId, kind, assetId) =>
      ipcRenderer.invoke(IpcChannel.artworkEditFromGrid, gameId, kind, assetId),
    steamChoices: (gameId) => ipcRenderer.invoke(IpcChannel.artworkEditSteamChoices, gameId),
    fromSteam: (gameId, kind, choiceId) =>
      ipcRenderer.invoke(IpcChannel.artworkEditFromSteam, gameId, kind, choiceId),
    save: (gameId, remove) => ipcRenderer.invoke(IpcChannel.artworkEditSave, gameId, remove)
  },
  settings: {
    get: () => ipcRenderer.invoke(IpcChannel.settingsGet),
    setSteamId: (steamId) => ipcRenderer.invoke(IpcChannel.settingsSetSteamId, steamId),
    setSecret: (kind, value) => ipcRenderer.invoke(IpcChannel.settingsSetSecret, kind, value),
    setStartFullscreen: (enabled) =>
      ipcRenderer.invoke(IpcChannel.settingsSetStartFullscreen, enabled),
    setOpenAtLogin: (enabled) => ipcRenderer.invoke(IpcChannel.settingsSetOpenAtLogin, enabled),
    testConnection: (kind) => ipcRenderer.invoke(IpcChannel.settingsTestConnection, kind)
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
