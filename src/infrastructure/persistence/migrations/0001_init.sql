-- Initial schema. Source of truth: docs/DATA_BASE_CONTEXT.md (v0.3).
-- Conventions: STRICT tables; booleans are INTEGER 0/1 with CHECK; timestamps
-- are ISO-8601 UTC TEXT; dates are YYYY-MM-DD TEXT.

-- §3.10 Origins (D-05): extensible; built-in rows below.
CREATE TABLE origins (
  key     TEXT    PRIMARY KEY CHECK (key <> '' AND key NOT GLOB '*[^a-z0-9-]*'),
  name    TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (trim(name) <> ''),
  builtin INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1))
) STRICT;

INSERT INTO origins (key, name, builtin) VALUES
  ('steam', 'Steam', 1),
  ('manual', 'PC', 1),
  ('yuzu', 'Yuzu', 1),
  ('ps2', 'PlayStation 2', 1);

-- §3.1 Games
CREATE TABLE games (
  id                  INTEGER PRIMARY KEY,
  steam_id            INTEGER UNIQUE,
  title               TEXT    NOT NULL,
  description         TEXT,
  developer           TEXT,
  release_date        TEXT,
  time_last_played    TEXT,
  hidden              INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  installed           INTEGER CHECK (installed IN (0, 1)),
  playtime            INTEGER NOT NULL DEFAULT 0 CHECK (playtime >= 0),
  beated              INTEGER NOT NULL DEFAULT 0 CHECK (beated IN (0, 1)),
  required_age        TEXT,
  origin              TEXT    NOT NULL REFERENCES origins (key) ON UPDATE RESTRICT ON DELETE RESTRICT,
  metadata_fetched_at TEXT,
  CHECK (origin <> 'steam' OR steam_id IS NOT NULL)
) STRICT;

CREATE INDEX games_origin_idx ON games (origin);

-- §3.3 Users: exactly one row (D-10), created here.
CREATE TABLE users (
  id                            INTEGER PRIMARY KEY CHECK (id = 1),
  steam_id                      TEXT    UNIQUE CHECK (
                                  steam_id IS NULL
                                  OR (length(steam_id) = 17 AND steam_id NOT GLOB '*[^0-9]*')
                                ),
  steam_api_key_encrypted       BLOB,
  steamgriddb_api_key_encrypted BLOB,
  platine                       INTEGER NOT NULL DEFAULT 0 CHECK (platine >= 0),
  gold                          INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  silver                        INTEGER NOT NULL DEFAULT 0 CHECK (silver >= 0),
  bronze                        INTEGER NOT NULL DEFAULT 0 CHECK (bronze >= 0)
) STRICT;

INSERT INTO users (id) VALUES (1);

-- §3.4 Achievements
CREATE TABLE achievements (
  id             INTEGER PRIMARY KEY,
  game_id        INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  api_name       TEXT    NOT NULL,
  display_name   TEXT    NOT NULL,
  description    TEXT,
  icon           TEXT,
  unlocked       INTEGER NOT NULL DEFAULT 0 CHECK (unlocked IN (0, 1)),
  unlocked_at    TEXT,
  global_percent REAL    CHECK (global_percent BETWEEN 0 AND 100),
  tier           TEXT    NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold')),
  UNIQUE (game_id, api_name)
) STRICT;

-- §3.5 Genres
CREATE TABLE genres (
  id   INTEGER PRIMARY KEY,
  name TEXT    NOT NULL UNIQUE COLLATE NOCASE
) STRICT;

-- §3.6 Game <-> genre
CREATE TABLE game_genres (
  game_id  INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, genre_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX game_genres_genre_idx ON game_genres (genre_id);

-- §3.7 Launch configuration for every origin except steam (D-07).
CREATE TABLE game_launch_configs (
  game_id           INTEGER PRIMARY KEY REFERENCES games (id) ON DELETE CASCADE,
  executable_path   TEXT    NOT NULL,
  arguments         TEXT    CHECK (arguments IS NULL OR json_type(arguments) = 'array'),
  working_directory TEXT
) STRICT;

-- §3.8 Play sessions (D-08). last_seen_at is the launcher heartbeat.
CREATE TABLE play_sessions (
  id               INTEGER PRIMARY KEY,
  game_id          INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  started_at       TEXT    NOT NULL,
  last_seen_at     TEXT    NOT NULL,
  ended_at         TEXT,
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  status           TEXT    NOT NULL CHECK (status IN ('running', 'completed', 'interrupted')),
  CHECK (status = 'running' OR (ended_at IS NOT NULL AND duration_seconds IS NOT NULL))
) STRICT;

CREATE INDEX play_sessions_game_idx ON play_sessions (game_id);
CREATE UNIQUE INDEX play_sessions_one_running_idx ON play_sessions (game_id) WHERE status = 'running';

-- §3.9 Artwork (D-15)
CREATE TABLE game_artwork (
  id            INTEGER PRIMARY KEY,
  game_id       INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK (kind IN ('cover_square', 'cover_portrait', 'logo', 'background', 'header')),
  local_path    TEXT    NOT NULL,
  source        TEXT    NOT NULL CHECK (source IN ('steam', 'steamgriddb', 'user')),
  source_url    TEXT,
  width         INTEGER CHECK (width > 0),
  height        INTEGER CHECK (height > 0),
  user_selected INTEGER NOT NULL DEFAULT 0 CHECK (user_selected IN (0, 1)),
  fetched_at    TEXT,
  UNIQUE (game_id, kind)
) STRICT;
