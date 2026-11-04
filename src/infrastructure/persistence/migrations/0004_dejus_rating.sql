-- Phase 6b (owner decision): the age rating of Steam games comes from the
-- Brazilian DEJUS rating in appdetails (ratings.dejus.rating), not from
-- required_age. Clear the values taken from required_age and mark Steam
-- games for a new metadata fetch (D-16: only metadata_fetched_at drives it).
-- Manual games keep the rating the user chose. No schema change.
UPDATE games
SET required_age = NULL,
    metadata_fetched_at = NULL
WHERE origin = 'steam';
