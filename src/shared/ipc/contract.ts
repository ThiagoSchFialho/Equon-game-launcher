// IPC contract shared by main, preload and renderer.
// Keep this file free of runtime dependencies: the sandboxed preload bundles it
// and cannot load npm packages.

export const IpcChannel = {
  appGetInfo: 'app:get-info'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

export interface AppInfo {
  name: string
  version: string
}

/** API exposed to the renderer as `window.equon`. */
export interface EquonApi {
  app: {
    getInfo(): Promise<AppInfo>
  }
}
