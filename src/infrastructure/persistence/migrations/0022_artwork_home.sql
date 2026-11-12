-- "Imagem da home" (owner decision, D-30): the art behind the Home screen, a seventh kind. By
-- default the Home uses the launch image, then the background. SQLite cannot change a CHECK in
-- place: create, copy, rename (as 0013 did for the launch image).
-- Source: DATA_BASE_CONTEXT.md §3.9, ARCHITECTURE.md §3.29.
CREATE TABLE game_artwork_new (
  id            INTEGER PRIMARY KEY,
  game_id       INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('cover_square', 'cover_portrait', 'logo', 'background', 'header', 'launch', 'home')),
  local_path    TEXT    NOT NULL,
  source        TEXT    NOT NULL CHECK (source IN ('steam', 'steamgriddb', 'igdb', 'user')),
  source_url    TEXT,
  width         INTEGER CHECK (width > 0),
  height        INTEGER CHECK (height > 0),
  user_selected INTEGER NOT NULL DEFAULT 0 CHECK (user_selected IN (0, 1)),
  fetched_at    TEXT,
  UNIQUE (game_id, kind)
) STRICT;

INSERT INTO game_artwork_new
  SELECT id, game_id, kind, local_path, source, source_url, width, height, user_selected, fetched_at
  FROM game_artwork;

DROP TABLE game_artwork;
ALTER TABLE game_artwork_new RENAME TO game_artwork;

CREATE TABLE game_artwork_removed_new (
  game_id    INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('cover_square', 'cover_portrait', 'logo', 'background', 'header', 'launch', 'home')),
  removed_at TEXT    NOT NULL,
  PRIMARY KEY (game_id, kind)
) STRICT;

INSERT INTO game_artwork_removed_new SELECT game_id, kind, removed_at FROM game_artwork_removed;

DROP TABLE game_artwork_removed;
ALTER TABLE game_artwork_removed_new RENAME TO game_artwork_removed;
