import { describe, expect, it } from 'vitest'
import { parseArtworkUrl } from '../../../src/main/artwork/artwork-url'
import { ARTWORK_KINDS as SHARED_KINDS, artworkUrl } from '../../../src/shared/ipc/contract'
import { ARTWORK_KINDS as DOMAIN_KINDS } from '../../../src/core/domain'

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
