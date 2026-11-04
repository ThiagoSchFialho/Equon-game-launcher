-- Phase 7 (owner decision): the art of a locked achievement is not always a grey
-- copy of the unlocked one, so Steam's own icongray is stored and shown.
-- Filled by the next achievement sync. Source: DATA_BASE_CONTEXT.md §3.4.
ALTER TABLE achievements ADD COLUMN icon_locked TEXT;
