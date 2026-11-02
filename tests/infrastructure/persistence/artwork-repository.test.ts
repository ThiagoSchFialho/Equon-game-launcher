import { beforeEach, describe, expect, it } from 'vitest'
import type { ArtworkRepository } from '../../../src/core/application'
import type { GameArtwork } from '../../../src/core/domain'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence'
import { createArtworkRepository } from '../../../src/infrastructure/persistence'
import { createTestDb, insertGame } from '../../helpers/db'

let db: SqliteDatabase
let artwork: ArtworkRepository

beforeEach(() => {
  db = createTestDb()
  artwork = createArtworkRepository(db)
})

const art = (gameId: number, values: Partial<GameArtwork> = {}): GameArtwork => ({
  gameId,
  kind: 'cover_square',
  localPath: `${gameId}/cover_square.png`,
  source: 'steamgriddb',
  sourceUrl: 'https://example.com/a.png',
  width: 600,
  height: 600,
  userSelected: false,
  fetchedAt: '2026-11-02T10:00:00Z',
  ...values
})

describe('ArtworkRepository', () => {
  it('saves, reads and lists kinds per game', () => {
    const a = insertGame(db)
    const b = insertGame(db)
    artwork.save(art(a))
    artwork.save(art(a, { kind: 'logo', localPath: `${a}/logo.png` }))
    artwork.save(art(b, { kind: 'header', localPath: `${b}/header.png` }))

    expect(artwork.get(a, 'cover_square')).toEqual(art(a))
    expect(artwork.get(a, 'background')).toBeNull()
    expect(artwork.listKinds()).toEqual(
      new Map([
        [a, ['cover_square', 'logo']],
        [b, ['header']]
      ])
    )
  })

  it('replaces automatic art with newer automatic art', () => {
    const id = insertGame(db)
    artwork.save(art(id))
    expect(artwork.save(art(id, { width: 1024, height: 1024 }))).toBe(true)
    expect(artwork.get(id, 'cover_square')?.width).toBe(1024)
  })

  it('never replaces user-selected art with an automatic fetch', () => {
    const id = insertGame(db)
    artwork.save(art(id, { source: 'user', sourceUrl: null, userSelected: true }))
    expect(artwork.save(art(id))).toBe(false)
    expect(artwork.get(id, 'cover_square')).toMatchObject({ source: 'user', userSelected: true })
  })

  it('lets the user replace their own selection', () => {
    const id = insertGame(db)
    artwork.save(art(id, { source: 'user', userSelected: true }))
    expect(
      artwork.save(art(id, { source: 'user', userSelected: true, localPath: `${id}/new.png` }))
    ).toBe(true)
    expect(artwork.get(id, 'cover_square')?.localPath).toBe(`${id}/new.png`)
  })
})
