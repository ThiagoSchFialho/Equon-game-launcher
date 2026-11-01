export interface AppOrigin {
  /** Dev server URL (electron-vite dev), if any. */
  devServerUrl?: string
  /** file:// URL of the bundled renderer index.html (production). */
  rendererFileUrl: string
}

/**
 * True when `url` belongs to the app's own renderer. Everything else (remote
 * sites, other local files, custom protocols) is rejected.
 */
export function isAppUrl(url: string, origin: AppOrigin): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (origin.devServerUrl !== undefined) {
    return parsed.origin === new URL(origin.devServerUrl).origin
  }

  const expected = new URL(origin.rendererFileUrl)
  return parsed.protocol === 'file:' && parsed.pathname === expected.pathname
}
