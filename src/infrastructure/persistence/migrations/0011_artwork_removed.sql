-- Art the user removed stays removed: automatic downloads skip it until the user chooses
-- another image. Source: DATA_BASE_CONTEXT.md §3.9.
CREATE TABLE game_artwork_removed (
  game_id    INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('cover_square', 'cover_portrait', 'logo', 'background', 'header')),
  removed_at TEXT    NOT NULL,
  PRIMARY KEY (game_id, kind)
) STRICT;
