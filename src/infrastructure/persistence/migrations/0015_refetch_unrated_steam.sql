-- Steam games without an age rating fetch their store data once more, now that an age DEJUS
-- does not have (Steam generates "6") goes up to the nearest rating (owner decision,
-- 2026-11-07). A one-time exception to D-16, like 0005. Store data only fills empty fields,
-- so nothing else changes. Source: DATA_BASE_CONTEXT.md §4.2.
UPDATE games SET metadata_fetched_at = NULL
WHERE origin = 'steam' AND required_age IS NULL;
