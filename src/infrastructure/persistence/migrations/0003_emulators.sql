-- Phase 4 (owner change): emulators become their own table; Yuzu games store
-- only the ROM. Source of truth: docs/DATA_BASE_CONTEXT.md (v0.5) §3.7, §3.12.

-- Emulator settings no longer live on origins.
ALTER TABLE origins DROP COLUMN default_executable_path;
ALTER TABLE origins DROP COLUMN default_arguments;

-- §3.12 Supported emulators and the executable the user configured.
CREATE TABLE emulators (
  key             TEXT PRIMARY KEY CHECK (key IN ('yuzu')),
  executable_path TEXT NOT NULL
) STRICT;

-- §3.7 executable_path becomes optional and rom_path is added; exactly one is
-- set. SQLite cannot relax NOT NULL in place: create, copy, rename (foreign
-- keys are off around migrations).
CREATE TABLE game_launch_configs_new (
  game_id           INTEGER PRIMARY KEY REFERENCES games (id) ON DELETE CASCADE,
  executable_path   TEXT,
  rom_path          TEXT,
  arguments         TEXT CHECK (arguments IS NULL OR json_type(arguments) = 'array'),
  working_directory TEXT,
  CHECK ((executable_path IS NULL) <> (rom_path IS NULL))
) STRICT;

INSERT INTO game_launch_configs_new (game_id, executable_path, arguments, working_directory)
  SELECT game_id, executable_path, arguments, working_directory FROM game_launch_configs;

DROP TABLE game_launch_configs;
ALTER TABLE game_launch_configs_new RENAME TO game_launch_configs;
