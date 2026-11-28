-- A name the user gives a game (owner decision, D-38), shown everywhere and used to sort and
-- search; NULL = the game's own title. Sync never writes it, so Steam's name never replaces it.
-- Source: DATA_BASE_CONTEXT.md (GAMES), ARCHITECTURE.md §3.37.
ALTER TABLE games ADD COLUMN display_title TEXT
  CHECK (display_title IS NULL OR length(display_title) BETWEEN 1 AND 200);
