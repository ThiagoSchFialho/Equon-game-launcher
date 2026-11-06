import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import type { AchievementRepository, ArtworkRepository } from '../../core/application'
import { achievementIconPath } from '../../infrastructure/artwork/achievement-icons'
import { ARTWORK_SCHEME } from '../../shared/ipc/contract'
import { resolveInside } from '../security/paths'
import type { ArtworkEditor, ServedImage } from './artwork-editor'
import {
  parseAchievementIconUrl,
  parseArtworkUrl,
  parseDraftArtworkUrl,
  parseGridThumbnailUrl
} from './artwork-url'

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
  cacheDir: string,
  editor: Pick<ArtworkEditor, 'draftImage' | 'gridThumbnail'>
): void {
  const served = (image: ServedImage | null): Response =>
    image
      ? new Response(new Uint8Array(image.bytes), { headers: { 'content-type': image.mime } })
      : new Response(null, { status: 404 })

  protocol.handle(ARTWORK_SCHEME, async (request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    const draftKind = parseDraftArtworkUrl(request.url)
    if (draftKind !== null) return served(editor.draftImage(draftKind))
    const assetId = parseGridThumbnailUrl(request.url)
    if (assetId !== null) return served(await editor.gridThumbnail(assetId))
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
