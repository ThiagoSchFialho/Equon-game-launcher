-- Configurações › Aparência (owner decision, D-25): the focused game's art behind the Home
-- screen, off by default, with how blurred (level 0 to 10) and how darkened (0% to 90%, in
-- steps of 10) it is. Source: DATA_BASE_CONTEXT.md §3.3 (USERS), ARCHITECTURE.md §3.24.
ALTER TABLE users ADD COLUMN home_art_background INTEGER NOT NULL DEFAULT 0
  CHECK (home_art_background IN (0, 1));
ALTER TABLE users ADD COLUMN home_art_blur INTEGER NOT NULL DEFAULT 4
  CHECK (home_art_blur BETWEEN 0 AND 10);
ALTER TABLE users ADD COLUMN home_art_dim INTEGER NOT NULL DEFAULT 60
  CHECK (home_art_dim BETWEEN 0 AND 90 AND home_art_dim % 10 = 0);
