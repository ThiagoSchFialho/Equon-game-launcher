import { describe, expect, it } from 'vitest'
import {
  parseAchievementIconUrl,
  parseArtworkUrl,
  parseDraftArtworkUrl,
  parseGridThumbnailUrl
} from '../../../src/main/artwork/artwork-url'
import {
  ARTWORK_KINDS as SHARED_KINDS,
  achievementIconUrl,
  artworkUrl,
  draftArtworkUrl,
  gridThumbnailUrl
} from '../../../src/shared/ipc/contract'
import { ARTWORK_KINDS as DOMAIN_KINDS } from '../../../src/core/domain'

describe('artwork URL version', () => {
  it('survives the address and tells nothing else to main', () => {
    const url = artworkUrl(42, 'logo', '2026-11-05T19:25:41Z')
    expect(url).not.toBe(artworkUrl(42, 'logo'))
    expect(url).not.toBe(artworkUrl(42, 'logo', '2026-11-05T19:25:42Z'))
    expect(parseArtworkUrl(url)).toEqual({ gameId: 42, kind: 'logo' })
    expect(artworkUrl(42, 'logo', null)).toBe(artworkUrl(42, 'logo'))
  })

  it('accepts nothing else in the query', () => {
    for (const bad of [
      'equon-art://game/42/logo?x=1',
      'equon-art://game/42/logo?v=1&x=2',
      'equon-art://game/42/logo?v=',
      'equon-art://game/42/logo?v=' + 'a'.repeat(65),
      'equon-art://game/42/logo?v=../../secret'
    ]) {
      expect(parseArtworkUrl(bad), bad).toBeNull()
    }
  })
})

describe('achievement icon URLs', () => {
  it('round-trips and rejects anything else', () => {
    expect(parseAchievementIconUrl(achievementIconUrl(42, true))).toEqual({ id: 42, locked: true })
    expect(parseAchievementIconUrl(achievementIconUrl(42, false))).toEqual({
      id: 42,
      locked: false
    })
    for (const bad of [
      'equon-art://achievement/0',
      'equon-art://achievement/abc',
      'equon-art://achievement/42',
      'equon-art://achievement/42/x',
      'equon-art://achievement/42/locked?x=1',
      'equon-art://achievement/..%2F1',
      'equon-art://game/42/logo',
      'file:///C:/a.png'
    ]) {
      expect(parseAchievementIconUrl(bad), bad).toBeNull()
    }
  })
})

describe('artwork URLs', () => {
  it('round-trips every kind', () => {
    for (const kind of SHARED_KINDS) {
      expect(parseArtworkUrl(artworkUrl(42, kind))).toEqual({ gameId: 42, kind })
    }
  })

  it('rejects anything that is not exactly equon-art://game/<id>/<kind>', () => {
    for (const bad of [
      'equon-art://42/logo',
      'equon-art://game/0/logo',
      'equon-art://game/-1/logo',
      'equon-art://game/abc/logo',
      'equon-art://game/42/banner',
      'equon-art://game/42/logo/extra',
      'equon-art://game/42/logo%2Fextra',
      'equon-art://game/42/logo?x=1',
      'equon-art://game/42/logo#x',
      'equon-art://other/42/logo',
      'equon-art://game:8080/42/logo',
      'equon-art://user@game/42/logo',
      'file:///C:/Windows/win.ini',
      'https://example.com/42/logo',
      'not a url'
    ]) {
      expect(parseArtworkUrl(bad), bad).toBeNull()
    }
  })

  it('normalizes dot segments before validating (no file path is derived from the URL)', () => {
    expect(parseArtworkUrl('equon-art://game/42/x/../logo')).toEqual({ gameId: 42, kind: 'logo' })
  })

  it('keeps the shared kinds in sync with the domain', () => {
    expect([...SHARED_KINDS]).toEqual([...DOMAIN_KINDS])
  })
})

describe('addresses of the art editor', () => {
  it('reads the preview of an image not saved yet', () => {
    expect(parseDraftArtworkUrl(draftArtworkUrl('logo', 3))).toBe('logo')
    for (const bad of [
      'equon-art://draft/header?v=3',
      'equon-art://draft/logo?v=x',
      'equon-art://draft/logo/more',
      'equon-art://draft/..%2Flogo',
      'equon-art://game/1/logo',
      'https://draft/logo'
    ]) {
      expect(parseDraftArtworkUrl(bad), bad).toBeNull()
    }
  })

  it('reads a thumbnail of the gallery', () => {
    expect(parseGridThumbnailUrl(gridThumbnailUrl(42))).toBe(42)
    for (const bad of [
      'equon-art://grid/0',
      'equon-art://grid/x',
      'equon-art://grid/42/more',
      'equon-art://grid/42?v=1',
      'equon-art://draft/42',
      'https://grid/42'
    ]) {
      expect(parseGridThumbnailUrl(bad), bad).toBeNull()
    }
  })
})
