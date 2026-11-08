-- Settings › Sistema › "Sons da interface" (owner decision): on by default.
-- Source: DATA_BASE_CONTEXT.md §3.3 (USERS), ARCHITECTURE.md §3.23 (D-24).
ALTER TABLE users ADD COLUMN ui_sounds INTEGER NOT NULL DEFAULT 1
  CHECK (ui_sounds IN (0, 1));
