-- The folder of an emulator's ROMs: its loose .nsp and .xci files become games (owner decision).
-- Source: DATA_BASE_CONTEXT.md §3.12.
ALTER TABLE emulators ADD COLUMN rom_directory TEXT;
