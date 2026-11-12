-- "Capas da home" › "Limitar quantidade de jogos na home" (owner decision, D-31): when on, the
-- Home screen shows at most 12 games, the most recently played. Off by default.
-- Source: DATA_BASE_CONTEXT.md (USERS), ARCHITECTURE.md §3.30.
ALTER TABLE users ADD COLUMN home_limit_games INTEGER NOT NULL DEFAULT 0
  CHECK (home_limit_games IN (0, 1));
