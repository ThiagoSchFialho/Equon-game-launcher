-- Phase 7 (owner decision): when the achievements of a game were last synced
-- successfully. Together with the rows it tells "never synced" (NULL) from "this
-- game has no achievements" (a date and no rows). Source: DATA_BASE_CONTEXT.md §3.1.
ALTER TABLE games ADD COLUMN achievements_synced_at TEXT;
