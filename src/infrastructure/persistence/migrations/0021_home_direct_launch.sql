-- Settings › Sistema › "Ignorar tela do jogo na home" (owner decision, D-28): on the Home
-- screen, A starts the game instead of opening its page. Off by default.
-- Source: DATA_BASE_CONTEXT.md (USERS), ARCHITECTURE.md §3.27.
ALTER TABLE users ADD COLUMN home_direct_launch INTEGER NOT NULL DEFAULT 0
  CHECK (home_direct_launch IN (0, 1));
