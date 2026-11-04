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
  return (
    parsed.protocol === 'file:' &&
    // file://server/... is a network share, even with the same path.
    parsed.host === expected.host &&
    withUpperDrive(parsed.pathname) === withUpperDrive(expected.pathname)
  )
}

/** Windows drive letters have no case: a d:\ shell gives /d:/ while Chromium reports /D:/. */
function withUpperDrive(pathname: string): string {
  return pathname.replace(/^\/[a-z]:/, (drive) => drive.toUpperCase())
}
