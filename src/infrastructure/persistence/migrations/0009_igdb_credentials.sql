-- IGDB connection (owner decision, D-18): Twitch app credentials, encrypted with safeStorage
-- like the other keys. Source: DATA_BASE_CONTEXT.md §3.3.
ALTER TABLE users ADD COLUMN igdb_client_id_encrypted BLOB;
ALTER TABLE users ADD COLUMN igdb_client_secret_encrypted BLOB;
