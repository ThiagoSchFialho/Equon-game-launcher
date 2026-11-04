-- Phase 6b (owner decision): Steam games also store release_date from
-- appdetails. Queue every Steam game for a new metadata fetch (D-16: only
-- metadata_fetched_at drives it). Stored values are kept until valid ones
-- arrive. No schema change.
UPDATE games
SET metadata_fetched_at = NULL
WHERE origin = 'steam';
