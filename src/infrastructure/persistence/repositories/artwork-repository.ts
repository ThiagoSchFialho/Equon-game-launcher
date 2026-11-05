import type { ArtworkRepository } from '../../../core/application'
import type { ArtworkKind, ArtworkSource, GameArtwork } from '../../../core/domain'
import type { SqliteDatabase } from '../database'
import { toBit, toBool } from './rows'

interface ArtworkRow {
  game_id: number
  kind: ArtworkKind
  local_path: string
  source: ArtworkSource
  source_url: string | null
  width: number | null
  height: number | null
  user_selected: number
  fetched_at: string | null
}

const toArtwork = (row: ArtworkRow): GameArtwork => ({
  gameId: row.game_id,
  kind: row.kind,
  localPath: row.local_path,
  source: row.source,
  sourceUrl: row.source_url,
  width: row.width,
  height: row.height,
  userSelected: toBool(row.user_selected),
  fetchedAt: row.fetched_at
})

export function createArtworkRepository(db: SqliteDatabase): ArtworkRepository {
  const selectOne = db.prepare<[number, string], ArtworkRow>(
    'SELECT * FROM game_artwork WHERE game_id = ? AND kind = ?'
  )
  const selectKinds = db.prepare<[], { game_id: number; kind: ArtworkKind }>(
    'SELECT game_id, kind FROM game_artwork ORDER BY game_id, kind'
  )
  const selectVersions = db.prepare<[], { game_id: number; version: string | null }>(
    'SELECT game_id, max(fetched_at) AS version FROM game_artwork GROUP BY game_id'
  )
  // User-selected art is replaced only by another user selection (D-15).
  const upsert = db.prepare<Record<string, unknown>>(`
    INSERT INTO game_artwork
      (game_id, kind, local_path, source, source_url, width, height, user_selected, fetched_at)
    VALUES
      (@gameId, @kind, @localPath, @source, @sourceUrl, @width, @height, @userSelected, @fetchedAt)
    ON CONFLICT (game_id, kind) DO UPDATE SET
      local_path    = excluded.local_path,
      source        = excluded.source,
      source_url    = excluded.source_url,
      width         = excluded.width,
      height        = excluded.height,
      user_selected = excluded.user_selected,
      fetched_at    = excluded.fetched_at
    WHERE game_artwork.user_selected = 0 OR excluded.user_selected = 1`)

  return {
    get: (gameId, kind) => {
      const row = selectOne.get(gameId, kind)
      return row ? toArtwork(row) : null
    },

    listVersions: () => {
      const versions = new Map<number, string>()
      for (const { game_id, version } of selectVersions.all()) {
        if (version !== null) versions.set(game_id, version)
      }
      return versions
    },

    listKinds: () => {
      const byGame = new Map<number, ArtworkKind[]>()
      for (const { game_id, kind } of selectKinds.all()) {
        const kinds = byGame.get(game_id) ?? []
        kinds.push(kind)
        byGame.set(game_id, kinds)
      }
      return byGame
    },

    save: (artwork) =>
      upsert.run({
        gameId: artwork.gameId,
        kind: artwork.kind,
        localPath: artwork.localPath,
        source: artwork.source,
        sourceUrl: artwork.sourceUrl,
        width: artwork.width,
        height: artwork.height,
        userSelected: toBit(artwork.userSelected),
        fetchedAt: artwork.fetchedAt
      }).changes > 0
  }
}
