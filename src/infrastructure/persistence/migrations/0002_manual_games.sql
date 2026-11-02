-- Phase 4: manual-game slice. Source of truth: docs/DATA_BASE_CONTEXT.md (v0.4).

-- §3.10 Emulator defaults that pre-fill the add-game form.
ALTER TABLE origins ADD COLUMN default_executable_path TEXT;
ALTER TABLE origins ADD COLUMN default_arguments TEXT
  CHECK (default_arguments IS NULL OR json_type(default_arguments) = 'array');

-- §3.1 Playtime the user enters for non-Steam games (time played elsewhere).
ALTER TABLE games ADD COLUMN playtime_offset INTEGER NOT NULL DEFAULT 0
  CHECK (playtime_offset >= 0);

-- The built-in manual origin is shown as "Jogo Local" (keep a user rename).
UPDATE origins SET name = 'Jogo Local' WHERE key = 'manual' AND name = 'PC';
