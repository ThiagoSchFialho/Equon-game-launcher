-- "Capas da home" in Configurações › Aparência (owner decision, D-27): the size of the Home
-- covers, the space between them (both levels 1 to 100) and where the row sits on the screen.
-- The defaults are the layout before this setting. Source: DATA_BASE_CONTEXT.md (USERS),
-- ARCHITECTURE.md §3.26.
ALTER TABLE users ADD COLUMN home_cover_size INTEGER NOT NULL DEFAULT 74
  CHECK (home_cover_size BETWEEN 1 AND 100);
ALTER TABLE users ADD COLUMN home_cover_gap INTEGER NOT NULL DEFAULT 35
  CHECK (home_cover_gap BETWEEN 1 AND 100);
ALTER TABLE users ADD COLUMN home_cover_position TEXT NOT NULL DEFAULT 'center'
  CHECK (home_cover_position IN ('center', 'bottom'));
