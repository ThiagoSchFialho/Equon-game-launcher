import type { GenreRepository } from '../../../core/application'
import { normalizeGenreName, type Genre } from '../../../core/domain'
import type { SqliteDatabase } from '../database'

export function createGenreRepository(db: SqliteDatabase): GenreRepository {
  const selectAll = db.prepare<[], Genre>('SELECT id, name FROM genres ORDER BY name, id')
  const selectForGame = db.prepare<[number], Genre>(`
    SELECT g.id, g.name FROM genres g
    JOIN game_genres gg ON gg.genre_id = g.id
    WHERE gg.game_id = ?
    ORDER BY g.name, g.id`)
  // The column is COLLATE NOCASE, so these match regardless of case and the
  // first spelling stored wins.
  const insertGenre = db.prepare<[string]>(
    'INSERT INTO genres (name) VALUES (?) ON CONFLICT (name) DO NOTHING'
  )
  const selectByName = db.prepare<[string], { id: number }>('SELECT id FROM genres WHERE name = ?')
  const clearLinks = db.prepare<[number]>('DELETE FROM game_genres WHERE game_id = ?')
  const insertLink = db.prepare<[number, number]>(
    'INSERT OR IGNORE INTO game_genres (game_id, genre_id) VALUES (?, ?)'
  )

  return {
    list: () => selectAll.all(),

    listForGame: (gameId) => selectForGame.all(gameId),

    setGameGenres: (gameId, names) =>
      db.transaction(() => {
        clearLinks.run(gameId)
        for (const raw of names) {
          const name = normalizeGenreName(raw)
          if (name === '') continue
          insertGenre.run(name)
          insertLink.run(gameId, (selectByName.get(name) as { id: number }).id)
        }
        return selectForGame.all(gameId)
      })()
  }
}
