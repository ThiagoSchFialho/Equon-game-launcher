# Equon Game Launcher --- Architecture

**Purpose:** Describe proposed technical boundaries and record decisions
that must be confirmed before implementation.

## 1. Goals and constraints

-   Windows desktop application, designed primarily for gamepad use,
    with mouse and keyboard support.
-   Conventional 16:9 screens; ultrawide is not required.
-   Unified library for Steam, Epic Games Store, GOG, and manually added
    games. Additional sources such as Yuzu can be considered where
    supported.
-   One local user and one configured Steam account; no cloud account or
    multi-user system in the current scope.
-   Keep the UI responsive during scans, API calls, and artwork loading.
-   Isolate integrations so one source's failure does not break the rest
    of the library.
-   Keep the code testable and understandable during AI-assisted
    development.
-   Preserve local/manual data and never treat an API failure as proof
    that data no longer exists.

## 2. Proposed logical layers

### Presentation

Home, Library, Game Details, and Settings screens; controller
focus/navigation; mouse/keyboard alternatives; artwork; loading, empty,
and error states. UI components should not call store APIs or database
SQL directly.

### Application / use cases

Coordinates workflows such as refreshing the library, adding a manual
game, launching a game, recording a session, refreshing metadata,
synchronizing achievements for one game, and manually synchronizing all
achievements.

### Domain

Defines concepts and rules independent of UI or external APIs: game,
origin, installation state, genre, achievement, and play session.
Enforce rules such as non-negative playtime and preserving manual
`hidden` / `beated` flags during metadata synchronization.

### Infrastructure

Database access and migrations, filesystem scanning, game launching,
process/session monitoring, API clients, image/metadata cache, secure
secret storage, and diagnostics.

### Integration adapters

Each store/source should have a separate adapter. An adapter should
explicitly declare which capabilities it supports: discovery, metadata,
installation-state detection, launch, session observation, and
achievements. Do not assume every store provides equivalent APIs or
capabilities.

## 3. Suggested conceptual structure

``` text
src/
  presentation/       # screens, components, controller focus/input
  application/        # use cases and orchestration
  domain/             # core models and rules
  infrastructure/
    persistence/      # database, migrations, repositories
    filesystem/       # library scanning and local files
    process/          # launch and session monitoring
    security/         # secret storage
  integrations/
    steam/
    epic/
    gog/
    manual/
  shared/
tests/
docs/
```

This is illustrative, not a fixed folder layout. Adapt it to the
selected framework and existing repository.

## 4. Important workflows

### Refresh library

1.  The user requests a refresh.
2.  Supported adapters scan their sources.
3.  Results are converted into internal models and include
    warnings/errors.
4.  Known identifiers are used to match games; ambiguous matches should
    be reviewed rather than silently merged.
5.  Valid changes are persisted transactionally.
6.  The UI displays results and partial failures.

A failed scan must not mark every game from that source as uninstalled.

### Metadata and genres

For Steam games, use the Steam Store `appdetails` endpoint where
supported. Validate optional fields and normalize the response before
persistence. Do not overwrite `hidden` or `beated`. Other sources
require separately validated data sources.

### Launch and playtime

When the user launches a game, validate the launch configuration, invoke
the appropriate adapter/client, and observe the process where feasible.
When the session ends, update `playtime` in minutes and
`time_last_played`. Process monitoring may not capture every child
process or intermediary launcher; document limitations and define
recovery for an unexpected launcher shutdown.

### Achievements

Use Steam's schema endpoint for definitions, player-achievements
endpoint for the configured account's unlock state, and
global-percentages endpoint for global rates. Upsert by
`(game_id, api_name)`. Sync one game's achievements after that game
closes; sync all supported games only after an explicit manual action.
Isolate failures and preserve the last known good data. `unlocked_at`
and `global_percent` may be `NULL`.

The Steam API key must stay in a trusted process and must never be
exposed to renderer/UI code or logs.

## 5. Persistence decision --- must be resolved

The current UML uses PostgreSQL-style types (`BIGSERIAL`, `TIMESTAMPTZ`,
etc.), while the product is a local, single-user desktop app.

Before implementing persistence, explicitly compare: - **SQLite or
another embedded database:** usually simpler to install and maintain for
a single-user desktop application. - **PostgreSQL:** can work, but
normally adds a separate service to install, configure, secure, run, and
back up.

Do not silently assume PostgreSQL is final just because the current
diagram uses its types. If SQLite is selected, deliberately adapt schema
types, constraints, and migrations. If PostgreSQL is selected, document
setup, packaging, service lifecycle, security, and backups.

Regardless of engine: use migrations, keep SQL behind a data-access
layer, use transactions for related changes, enforce constraints in the
actual database, and test migration/synchronization behavior.

### Data rules to preserve

-   `GAMES.playtime` is measured in minutes and cannot be negative.
-   `GAMES.origin` identifies the source.
-   `hidden` and `beated` are manual flags, both defaulting to `FALSE`.
-   `steam_id` is optional for non-Steam games and unique when present.
-   `ACHIEVEMENTS` has `UNIQUE (game_id, api_name)` and FK to `GAMES.id`
    with `ON DELETE CASCADE`.
-   `GAME_GENRES` has composite PK `(game_id, genre_id)` and cascading
    FKs.
-   `unlocked_at` and `global_percent` may be `NULL`.
-   Personal achievement progress = unlocked / total known achievements;
    handle zero total safely.
-   Only one local user/Steam account is in scope.

Verify these rules against `docs/DATABASE.md` and the real schema.

## 6. Desktop framework decision --- must be resolved

The requirements identify Windows as the initial platform and say
Electron's performance should be evaluated; the framework has not been
finalized.

Evaluate: - **Electron + React + TypeScript:** familiar web UI and
Node-based desktop capabilities; measure package size, memory, security
boundaries, and process handling. - **Tauri + web UI:** potentially
lighter packaging; validate native integration needs and the Rust-based
host layer.

Do not generate the full application skeleton until the desktop
framework, UI stack, and database engine have been chosen and recorded
here.

## 7. Security and reliability

-   Keep secrets and privileged filesystem/process operations out of
    untrusted UI code.
-   If Electron is selected, use context isolation, disable Node
    integration in the renderer, and expose only narrow, validated IPC
    operations.
-   Validate data from external APIs and inter-process messages.
-   Never log API keys or URLs containing secret query parameters.
-   Use timeouts and bounded retries for external requests.
-   Do not block rendering during scans or synchronization.
-   Treat failures as partial failures; do not delete valid data because
    a request failed.
-   Make synchronization safe to repeat.
-   Use migrations and tests for schema changes.

## 8. Testing strategy

-   **Unit:** domain rules, playtime calculations, progress percentage,
    API response mapping.
-   **Persistence:** migrations, constraints, upserts, cascades,
    transactions.
-   **Integration:** adapters with fixtures and simulated API failures.
-   **Application:** library refresh, launch failures, per-game
    achievement sync, manual full sync.
-   **UI/manual Windows:** controller focus, disconnect/reconnect,
    multiple Steam libraries, intermediary launchers, 1920×1080 and
    1280×720.

Avoid relying on live Steam API calls for every routine test. Use
fixtures/mocks and document a separate real-world verification
checklist.

## 9. Decisions required before implementation

1.  Desktop framework and UI stack.
2.  Database engine and migration tool.
3.  Windows packaging/installer strategy.
4.  Controller input library/approach.
5.  Steam discovery and launch mechanism.
6.  Epic/GOG discovery and launch methods.
7.  Secure storage for the Steam API key.
8.  Session timing and recovery policy.
9.  How to represent unknown installation state.
10. Where manual-game executable, arguments, and working directory are
    stored.
11. Approved `origin` values and validation.

The AI coding assistant must surface unresolved decisions instead of
silently inventing answers.

## 10. Definition of done

A change is ready when it meets acceptance criteria, respects boundaries
and security rules, includes appropriate tests, handles partial
failures, avoids unjustified dependencies, updates affected
documentation, and explains manual validation and known limitations.
