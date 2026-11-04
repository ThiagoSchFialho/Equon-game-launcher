import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import type { AchievementRepository, ArtworkRepository } from '../../core/application'
import { achievementIconPath } from '../../infrastructure/artwork/achievement-icons'
import { ARTWORK_SCHEME } from '../../shared/ipc/contract'
import { resolveInside } from '../security/paths'
import { parseAchievementIconUrl, parseArtworkUrl } from './artwork-url'

/** Must run before the app is ready. */
export function registerArtworkScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ARTWORK_SCHEME, privileges: { standard: true, secure: true } }
  ])
}

/** Serves cached artwork from `cacheDir`, looked up in GAME_ARTWORK, and achievement icons. */
export function handleArtworkProtocol(
  artwork: ArtworkRepository,
  achievements: AchievementRepository,
  cacheDir: string
): void {
  protocol.handle(ARTWORK_SCHEME, async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    const iconTarget = parseAchievementIconUrl(request.url)
    if (iconTarget !== null) {
      const achievement = achievements.getById(iconTarget.id)
      const icon =
        achievement &&
        achievementIconPath(cacheDir, achievement.gameId, iconTarget.id, iconTarget.locked)
      if (!icon) return new Response(null, { status: 404 })
      const response = await net.fetch(pathToFileURL(icon).href)
      return response.ok ? response : new Response(null, { status: 404 })
    }
    const target = parseArtworkUrl(request.url)
    if (!target) return new Response(null, { status: 400 })
    const art = artwork.get(target.gameId, target.kind)
    if (!art) return new Response(null, { status: 404 })
    const file = resolveInside(cacheDir, art.localPath)
    if (!file) return new Response(null, { status: 403 })
    const response = await net.fetch(pathToFileURL(file).href)
    return response.ok ? response : new Response(null, { status: 404 })
  })
}
