-- Phase 8 (owner decision): when the artwork queue last got answers for a game, so a
-- game with no art available is not tried again at every launcher start. NULL means it
-- still has to be tried; failures with no answer leave it NULL.
-- Source: DATA_BASE_CONTEXT.md §3.1.
ALTER TABLE games ADD COLUMN artwork_checked_at TEXT;
