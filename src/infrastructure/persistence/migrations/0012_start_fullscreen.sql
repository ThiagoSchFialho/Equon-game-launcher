-- Settings › Sistema (D-20): open the launcher in fullscreen. Starting with Windows is not
-- stored here: Windows owns that state. Source: DATA_BASE_CONTEXT.md §3.3.
ALTER TABLE users ADD COLUMN start_fullscreen INTEGER NOT NULL DEFAULT 0
  CHECK (start_fullscreen IN (0, 1));
