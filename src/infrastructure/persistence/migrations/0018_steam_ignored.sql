-- Steam games the user removed (owner decision, D-26), which the library scans and the
-- owned-games import skip. `permanent` = 1: "Remover e criar exceção", kept until the user takes
-- it off the list in Settings. `permanent` = 0: just "Remover", cleared by the next
-- "Atualizar biblioteca" the user asks for, which adds the game back. The title is kept to list
-- the exceptions. Source: DATA_BASE_CONTEXT.md §3.13, ARCHITECTURE.md §3.25.
CREATE TABLE steam_ignored (
  steam_id   INTEGER PRIMARY KEY CHECK (steam_id > 0),
  title      TEXT    NOT NULL,
  permanent  INTEGER NOT NULL CHECK (permanent IN (0, 1)),
  ignored_at TEXT    NOT NULL
) STRICT;
