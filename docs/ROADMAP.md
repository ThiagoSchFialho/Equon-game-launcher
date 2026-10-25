# Equon Game Launcher --- Roadmap

**Purpose:** Turn the product requirements into small, testable
milestones.

## Delivery principles

-   Build a working vertical slice before implementing every
    integration.
-   Ask the coding assistant to plan each milestone before editing
    files.
-   Use small Git commits, tests, and manual verification.
-   Keep the application useful when an integration is unavailable.
-   Mark a phase complete only after its acceptance criteria pass.

## Phase 0 --- Confirm the foundation

### Tasks

-   [ ] Review `README.md`, `PRODUCT.md`, `DESIGN_SYSTEM.md`, and
    `DATABASE.md`.
-   [ ] Choose the desktop framework and UI stack.
-   [ ] Choose the database engine. The UML currently uses
    PostgreSQL-style types, but an embedded database may be simpler for
    a local single-user app.
-   [ ] Choose package manager, test framework, lint/format tools, and
    migration strategy.
-   [ ] Decide secure storage for the Steam API key.
-   [ ] Define approved `origin` values and how unknown installation
    state is represented.
-   [ ] Record decisions in `ARCHITECTURE.md`.
-   [ ] Set up Git and `.gitignore`.

**Acceptance:** Key technical decisions and unresolved questions are
documented. No production feature code is written just to avoid making a
decision.

## Phase 1 --- Project skeleton

### Tasks

-   [ ] Create the desktop application skeleton.
-   [ ] Configure development, test, lint, and production-build scripts.
-   [ ] Add a basic automated test.
-   [ ] Establish boundaries between UI and privileged desktop
    operations.
-   [ ] Add a minimal screen/window proving the application launches.
-   [ ] Document local setup in the README.

**Acceptance:** App starts locally, automated checks pass, setup is
repeatable, and no secrets are committed.

## Phase 2 --- Database and domain

### Tasks

-   [ ] Add database connection and versioned migrations.
-   [ ] Implement the schema from `DATABASE.md`.
-   [ ] Confirm `GAMES.origin`, non-negative `playtime`, and uniqueness
    of non-null Steam IDs.
-   [ ] Confirm `UNIQUE (game_id, api_name)` and achievement FK cascade.
-   [ ] Confirm `GAME_GENRES` composite PK and cascading FKs.
-   [ ] Implement data-access functions for games, genres, and
    achievements.
-   [ ] Add tests for constraints, migrations, cascades, transactions,
    and progress calculation.

**Acceptance:** Games and genres can be saved/read; duplicate
achievements are prevented; deletion cascades work; zero achievements
does not divide by zero; manual flags are preserved.

## Phase 3 --- UI shell and controller navigation

### Tasks

-   [ ] Build primary navigation and initial Home, Library, and Game
    Details screens using `DESIGN_SYSTEM.md`.
-   [ ] Implement visible, predictable controller focus.
-   [ ] Support confirm, back, directions, and scrolling.
-   [ ] Preserve mouse and keyboard alternatives.
-   [ ] Implement loading, empty, unavailable, and error states.
-   [ ] Validate 1920×1080 and 1280×720.

**Acceptance:** Main screens are navigable with a controller, focus
remains visible after updates, and layouts work on conventional 16:9
displays.

## Phase 4 --- Manual-game vertical slice

### Tasks

-   [ ] Decide how to store executable path, optional arguments, and
    working directory.
-   [ ] Add, edit, and remove a manual game.
-   [ ] Show it in Library and Game Details.
-   [ ] Launch it with useful validation and errors.
-   [ ] Observe the process where feasible.
-   [ ] Record session duration and accumulate `playtime` in minutes.
-   [ ] Define recovery for unexpected launcher shutdown.

**Acceptance:** A user can add a local executable, select it, and launch
it; observed sessions update playtime without negative values or
duplicate accumulation. Document process-monitoring limitations.

This is the first end-to-end milestone and should precede broad store
integration.

## Phase 5 --- Library organization

### Tasks

-   [ ] Define a normalized discovery contract for integrations.
-   [ ] Add search by title.
-   [ ] Add filters by origin and known installation state.
-   [ ] Add sorting by title, recent activity, and playtime.
-   [ ] Add manual controls for `hidden` and `beated`.
-   [ ] Add refresh, empty, partial-failure, and duplicate-review
    states.
-   [ ] Keep the UI responsive during scans.

**Acceptance:** Search, filters, and sorting work together; manual flags
persist; failed scans do not erase existing data; ambiguous duplicate
matches are not silently merged.

## Phase 6 --- Steam library and metadata

### Tasks

-   [ ] Validate Steam library discovery, including `appmanifest_*.acf`
    and multiple library folders.
-   [ ] Discover installed Steam games and represent installation state
    reliably.
-   [ ] Validate the Steam game launch mechanism.
-   [ ] Import metadata and genres from `appdetails`.
-   [ ] Normalize responses and handle missing fields.
-   [ ] Securely store the API key and Steam account ID.
-   [ ] Test using fixtures and simulated failures.

**Acceptance:** Supported Steam games are discovered without obvious
duplicates; metadata refresh does not overwrite manual flags; API
failures do not break the rest of the library.

## Phase 7 --- Steam achievements

### Tasks

-   [ ] Import definitions using `GetSchemaForGame`.
-   [ ] Import unlock state using `GetPlayerAchievements`.
-   [ ] Import global percentages using
    `GetGlobalAchievementPercentagesForApp`.
-   [ ] Upsert by `(game_id, api_name)`.
-   [ ] Sync a game's achievements after that game closes, where
    supported.
-   [ ] Add a manual action to sync achievements for all supported Steam
    games.
-   [ ] Run sync in the background and isolate per-game failures.
-   [ ] Calculate personal completion as unlocked / total known
    achievements.
-   [ ] Preserve last known good data; allow `unlocked_at` and
    `global_percent` to be `NULL`.

**Acceptance:** Repeated sync creates no duplicates; closing one game
syncs only that game; full-library sync requires a manual action; failed
requests do not mark all achievements locked or delete existing data.

## Phase 8 --- Epic and GOG integrations

### Tasks

-   [ ] Research and document supported local discovery and launch
    methods for Epic Games Store.
-   [ ] Implement its adapter only after data sources and limitations
    are validated.
-   [ ] Repeat the research and implementation process for GOG.
-   [ ] Test each adapter and partial-failure behavior.
-   [ ] Review cross-source duplicate detection.

**Acceptance:** Each adapter reports its real capabilities; a store
failure does not break other sources; unsupported data is not
fabricated; official-client requirements are documented.

## Phase 9 --- Hardening and release preparation

### Tasks

-   [ ] Measure startup, library rendering, image loading, and scan
    performance on reference hardware.
-   [ ] Optimize caching and progressive image loading based on
    measurements.
-   [ ] Test controller disconnect/reconnect and input edge cases.
-   [ ] Test 1920×1080 and 1280×720.
-   [ ] Test network failures, malformed API responses, permissions, and
    interrupted sync.
-   [ ] Verify migration and backup/recovery approach.
-   [ ] Configure Windows packaging/installer.
-   [ ] Review security, logging, API key handling, and dependencies.
-   [ ] Update README with implemented features, setup, limitations, and
    screenshots.

**Acceptance:** A fresh installation can follow documented steps; core
local flows work without unnecessary network access; failures are
recoverable; README distinguishes implemented features from plans.

## Definition of done for every task

-   Meets acceptance criteria.
-   Includes automated tests appropriate to the risk.
-   Is manually checked for UI/controller behavior where relevant.
-   Avoids unrelated refactors and unjustified dependencies.
-   Updates architecture, database, design, or product docs when
    decisions change.
-   Reports changed files, tests run, results, and known limitations.

## Suggested first coding task

After Phase 0 decisions are confirmed, ask the coding assistant to
implement **only Phase 1 --- Project skeleton**. Do not ask it to
implement the entire roadmap in one prompt.
