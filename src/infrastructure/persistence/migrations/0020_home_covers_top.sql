-- "Capas da home" › Posição gains "Em cima" ('top'), the mirror of "Embaixo" (owner decision,
-- D-27). SQLite cannot change a CHECK in place: create, copy every column (encrypted keys
-- included), rename. The columns and their rules are those of 0001, 0009, 0012, 0016, 0017 and
-- 0019. Source: DATA_BASE_CONTEXT.md (USERS), ARCHITECTURE.md §3.26.
CREATE TABLE users_new (
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
  bronze                        INTEGER NOT NULL DEFAULT 0 CHECK (bronze >= 0),
  igdb_client_id_encrypted      BLOB,
  igdb_client_secret_encrypted  BLOB,
  start_fullscreen              INTEGER NOT NULL DEFAULT 0 CHECK (start_fullscreen IN (0, 1)),
  ui_sounds                     INTEGER NOT NULL DEFAULT 1 CHECK (ui_sounds IN (0, 1)),
  home_art_background           INTEGER NOT NULL DEFAULT 0 CHECK (home_art_background IN (0, 1)),
  home_art_blur                 INTEGER NOT NULL DEFAULT 4 CHECK (home_art_blur BETWEEN 0 AND 10),
  home_art_dim                  INTEGER NOT NULL DEFAULT 60
                                  CHECK (home_art_dim BETWEEN 0 AND 90 AND home_art_dim % 10 = 0),
  home_cover_size               INTEGER NOT NULL DEFAULT 74 CHECK (home_cover_size BETWEEN 1 AND 100),
  home_cover_gap                INTEGER NOT NULL DEFAULT 35 CHECK (home_cover_gap BETWEEN 1 AND 100),
  home_cover_position           TEXT    NOT NULL DEFAULT 'center'
                                  CHECK (home_cover_position IN ('top', 'center', 'bottom'))
) STRICT;

INSERT INTO users_new (
  id, steam_id, steam_api_key_encrypted, steamgriddb_api_key_encrypted,
  platine, gold, silver, bronze,
  igdb_client_id_encrypted, igdb_client_secret_encrypted,
  start_fullscreen, ui_sounds,
  home_art_background, home_art_blur, home_art_dim,
  home_cover_size, home_cover_gap, home_cover_position
)
SELECT
  id, steam_id, steam_api_key_encrypted, steamgriddb_api_key_encrypted,
  platine, gold, silver, bronze,
  igdb_client_id_encrypted, igdb_client_secret_encrypted,
  start_fullscreen, ui_sounds,
  home_art_background, home_art_blur, home_art_dim,
  home_cover_size, home_cover_gap, home_cover_position
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
