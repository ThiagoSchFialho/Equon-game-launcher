# Equon Game Launcher --- Roadmap

**Status:** Initial proposal.\
**Purpose:** Turn the product requirements into small, testable
milestones. No dates are promised; revise this roadmap after the
architecture decisions are confirmed.

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

-   [x] Review `README.md`, `PRODUCT.md`, `DESIGN_SYSTEM.md`, and
    `DATA_BASE_CONTEXT.md`.
-   [x] Choose the desktop framework and UI stack (Electron, React,
    TypeScript; D-01).
-   [x] Choose the database engine (SQLite; D-02).
-   [x] Choose package manager, build tool, test framework, lint/format
    tools, and migration strategy (D-03, D-14).
-   [x] Decide secure storage for API keys (`safeStorage`; D-04).
-   [x] Define approved `origin` values and how unknown installation
    state is represented (D-05, D-06).
-   [x] Record decisions in `ARCHITECTURE.md`.
-   [x] Set up Git and `.gitignore` (a starter `.gitignore` is provided).

**Acceptance:** Key technical decisions and unresolved questions are
documented. No production feature code is written just to avoid making a
decision.

## Phase 1 --- Project skeleton

### Tasks

-   [x] Create the desktop application skeleton.
-   [x] Configure development, test, lint, and production-build scripts.
-   [x] Add a basic automated test.
-   [x] Establish boundaries between UI and privileged desktop
    operations.
-   [x] Add a minimal screen/window proving the application launches.
-   [x] Document local setup in the README.
-   [x] Pin the Node and Electron versions; confirm that electron-vite is
    actively maintained (fallback: Electron Forge Vite template).
-   [x] Enable strict TypeScript and add the lint rules that enforce the
    layer boundaries in `ARCHITECTURE.md` §6.
-   [x] Configure the secure window settings (`contextIsolation`,
    `nodeIntegration` off, `sandbox`, restricted navigation, CSP).
-   [x] Make `better-sqlite3` work for Node (tests) and Electron (app);
    document it. (v13 ships N-API prebuilds, so no rebuild scripts are
    needed; a test guards this. See `ARCHITECTURE.md` §3.15.)
-   [x] Run the validation spike: render a grid of ~200 images, read a
    gamepad, load the SQLite module in Electron, check whether the
    chosen Electron provides `node:sqlite`, and record startup time and
    memory in `ARCHITECTURE.md`. (Buttons, triggers and sticks verified on hardware; reconnect and
    focus loss are checked in Phase 3.)

**Acceptance:** App starts locally, automated checks pass, setup is
repeatable, and no secrets are committed. Spike results are recorded;
D-01 or D-03 is reopened only if they are unacceptable.

## Phase 2 --- Database and domain

### Tasks

-   [x] Add database connection (with `PRAGMA foreign_keys = ON` on every
    connection) and versioned SQL migrations.
-   [x] Implement the schema from `DATA_BASE_CONTEXT.md`, including
    `GAME_LAUNCH_CONFIGS`, `PLAY_SESSIONS`, `GAME_ARTWORK`, nullable
    `installed`, `metadata_fetched_at`, the single-row `USERS` rule and
    encrypted key columns.
-   [x] Create `GAME_ARTWORK` with the five kinds: `cover_square`,
    `cover_portrait`, `logo`, `background` and `header`.
-   [x] Create the extensible `ORIGINS` table with the built-in origins
    (`steam`, `manual`, `yuzu`, `ps2`) and a repository to list, create,
    rename and delete user origins (D-05).
-   [x] Confirm `GAMES.origin` (foreign key to `ORIGINS`), non-negative
    `playtime`, and uniqueness of non-null Steam IDs.
-   [x] Confirm `UNIQUE (game_id, api_name)` and achievement FK cascade.
-   [x] Confirm `GAME_GENRES` composite PK and cascading FKs.
-   [x] Confirm foreign keys are actually enforced (tests must fail if
    the pragma is missing) and that upserts never touch `hidden` or
    `beated`.
-   [x] Confirm the single running session per game and the
    `playtime` derivation from completed and interrupted sessions.
-   [x] Store the Steam playtime baseline and apply a Steam sync result
    (overwrite `time_last_played`, sessions add on top of the baseline).
-   [x] Implement data-access functions for games, genres, and
    achievements.
-   [x] Add tests for constraints, migrations, cascades, transactions,
    and progress calculation.

**Acceptance:** Games and genres can be saved/read; duplicate
achievements are prevented; deletion cascades work; zero achievements
does not divide by zero; manual flags are preserved.

## Phase 3 --- UI shell and controller navigation

### Tasks

-   [x] Build primary navigation and initial Home, Library, and Game
    Details screens using `DESIGN_SYSTEM.md`.
-   [x] Implement visible, predictable controller focus.
-   [x] Implement the input module: Gamepad API polling, edge
    detection, dead zones and repeat rate, semantic actions, and a fake
    input source for tests.
-   [x] Implement placeholders for each artwork type (`cover_square`,
    `cover_portrait`, `logo`, `background`, `header`) and progressive
    image loading from the local cache.
-   [x] Support confirm, back, directions, and scrolling.
-   [x] Preserve mouse and keyboard alternatives.
-   [x] Implement loading, empty, unavailable, and error states.
-   [x] Validate 1920×1080 and 1280×720 (also 2560×1440).
-   [x] Validate on hardware: controller disconnect/reconnect and window
    focus loss (verified by the owner).
-   [x] Serve cached artwork through the `equon-art://` protocol and
    load game data through validated IPC (`games:list`, `games:get`).
-   [x] Separate dev user-data folder and a `dev:seed` script with
    sample games and generated artwork.
-   [x] Options menu dialog (focus in/out); its actions arrive in
    Phases 5 and 7. "Uninstall" is a future item, not in the MVP.

**Acceptance:** Main screens are navigable with a controller, focus
remains visible after updates, and layouts work on conventional 16:9
displays.

## Phase 4 --- Manual-game vertical slice

### Tasks

-   [x] Store executable path, optional arguments, and working directory
    in `GAME_LAUNCH_CONFIGS` (D-07); validate them as untrusted input.
-   [x] Add, edit, and remove a manual game.
-   [x] Show it in Library and Game Details.
-   [x] Launch it with useful validation and errors.
-   [x] Observe the process where feasible.
-   [x] Record each session in `PLAY_SESSIONS`, update `last_seen_at`
    periodically (heartbeat) and derive `playtime` (minutes) from the
    completed and interrupted sessions' seconds in one transaction.
-   [x] Let the user choose a local background image (1920×1080) for a
    manual game; covers come from SteamGridDB in Phase 6.
-   [x] Own controller-friendly file browser for executables, ROMs and
    images, with a "Usar janela do Windows" fallback (decided).
-   [x] On-screen keyboard and the add/edit game form (mockups "add game").
-   [x] On startup, mark sessions left `running` as `interrupted`,
    closed at their last heartbeat, and add their time (D-08).
-   [x] Let the user pick the origin of a manual game and manage their
    own origins (create, rename, delete unused), e.g. for a new emulator.
-   [x] User-entered playtime (`playtime_offset`); manual install state
    from the executable.
-   [x] "Emuladores" (Yuzu only): configure `yuzu.exe`; Yuzu
    games pick only the ROM and open with `-f -g "<rom>"`.
-   [x] Accept `.url` shortcuts (store schemes allowlist; no playtime).
-   [ ] Validate with real games from other launchers (e.g. Epic Games
    Store), which are added manually with `origin = manual`. Document
    games that fail to start from their `.exe` directly because they
    require the official client (login/DRM), and decide whether the
    launch configuration needs an alternative launch method.

**Acceptance:** A user can add a local executable, select it, and launch
it; observed sessions update playtime without negative values or
duplicate accumulation. Document process-monitoring limitations and any
games that need their official client to start.

This is the first end-to-end milestone and should precede broad store
integration. Manual games are the supported path for Epic and GOG
titles; no automatic Epic/GOG integration is planned.

## Phase 5 --- Library organization

### Tasks

-   [x] Define a normalized discovery contract for integrations
    (`core/application/discovery.ts`: adapter, capabilities,
    complete / partial / failed results, a plan that never writes "not
    installed" on a failed read and only lists duplicate candidates).
-   [x] Add search by title (on-screen keyboard; ignores case, accents
    and punctuation).
-   [x] Add filters by origin and known installation state, plus showing
    hidden games and only beaten games (X, gamepad or keyboard, opens the
    filters dialog; "Limpar filtros" next to sorting).
-   [x] Add sorting by title (default), recent activity, and playtime.
-   [x] Add manual controls for `hidden` and `beated` (game options
    menu, every origin).
-   [x] Library empty and "no results" states.
-   [x] Home shows every installed, non-hidden game (no limit), most
    recent session first (fixed rule).

The refresh button, scan progress, partial-failure and duplicate-review
screens moved to Phase 6: they need a real automatic source.

**Acceptance:** Search, filters, and sorting work together; manual flags
persist; the view survives navigation and resets on restart; the
discovery plan never erases data on failure and never merges duplicates.

## Phase 6 --- Steam library and metadata

### Tasks

Delivered in three reviewed steps: 6a (local Steam, Play, Settings),
6b (network: connection tests, `GetOwnedGames`, `appdetails`) and 6c
(artwork, duplicate review).

-   [x] Locate Steam through the Windows registry with a fallback to the
    default folder (no manual override: `libraryfolders.vdf` lists every
    library). *(6a)*
-   [x] Read `libraryfolders.vdf` and every `appmanifest_*.acf`, handling
    multiple library folders and ignoring non-game manifests. *(6a)*
-   [x] Interpret `StateFlags` (installed, installing, updating, paused,
    unhealthy) and pin the behavior with fixtures. *(6a)*
-   [x] Write `installed` as `1`, `0` or `NULL` following the rules in
    `DATA_BASE_CONTEXT.md` §3.2; a failed read never writes `0`. Local
    scan at startup and on "Atualizar biblioteca". *(6a)*
-   [x] Launch Steam games with `steam://rungameid/<appid>`, built in the
    main process from a validated App ID, and confirm the start through
    the registry `RunningAppID`. *(6a)*
-   [x] Observe Steam sessions from the registry `RunningAppID` (the
    manifest `AppRunning` flag is not set in practice); limits documented
    in D-12. *(6a)*
-   [x] Settings screen (gear in the top bar): Conexões (SteamID, keys,
    "Atualizar biblioteca") and Sobre. *(6a)*
-   [x] Import metadata and genres from `appdetails` **only when a game
    is discovered or added**; set `metadata_fetched_at` only after a
    valid response and retry failures on later refreshes. Portuguese
    (`l=brazilian`); fields: `genres`, `developers`, `short_description`,
    `release_date` and the Brazilian rating `ratings.dejus.rating`. *(6b)*
-   [x] Normalize responses and handle missing fields. *(6b)*
-   [x] Build the artwork pipeline: Steam `header_image` (Achievements
    screen) and `background_raw` (game page), SteamGridDB (square and portrait covers, logo; name search
    with user confirmation for manual games), throttled queue, local cache,
    validation of downloads, and no overwriting of user-selected art.
-   [x] Sync Steam playtime and last played once per launcher start
    with `GetOwnedGames` (after closing interrupted sessions and the local
    scan), using the repository support from Phase 2; a failed sync
    changes nothing. *(6b)*
-   [x] Securely store the Steam account ID and the Steam and
    SteamGridDB API keys (encrypted with `safeStorage`). *(6a)*
-   [x] "Testar conexão" for the Steam Web API (`GetPlayerSummaries`:
    profile name, private-profile warning) and SteamGridDB. *(6b)*
-   [x] Implement the Steam adapter on the Phase 5 discovery contract
    and wire it to the repositories. *(6a)*
-   [x] Add the "Atualizar biblioteca" action, scan progress (UI stays
    responsive during scans) and the partial-failure state. *(6a)*
-   [x] Duplicate-review step in Settings (candidates are never merged
    silently). *(6c)*
-   [ ] Test using fixtures and simulated failures (unreadable library,
    missing `libraryfolders.vdf`, download in progress, running game,
    corrupt files, network errors).

**Acceptance:** Supported Steam games are discovered without obvious
duplicates; metadata refresh does not overwrite manual flags; API
failures do not break the rest of the library; a disconnected library
drive marks its games as unknown, not uninstalled; the app is fully
usable without a SteamGridDB key.

## Phase 7 --- Achievements

### Tasks

-   [ ] Validate the current Steam Web API formats and limits before
    implementing; never log URLs that contain the API key.
-   [ ] Import definitions using `GetSchemaForGame`.
-   [ ] Import unlock state using `GetPlayerAchievements`.
-   [ ] Import global percentages using
    `GetGlobalAchievementPercentagesForApp`.
-   [ ] Upsert by `(game_id, api_name)`.
-   [ ] Sync a game's achievements automatically only after that game
    closes, when supported and when the launcher can observe the close.
-   [ ] Add a manual action to sync achievements for all supported
    games.
-   [ ] Do not implement periodic or automatic full-library
    synchronization.
-   [ ] Run sync in the background and isolate per-game failures.
-   [ ] Calculate personal completion as unlocked / total known
    achievements; handle games with no known achievements.
-   [ ] Implement the global achievements overview with aggregate trophy
    counts and a per-game progress list.
-   [ ] Sort the overview by last session descending by default.
-   [ ] Add the alternative overview sort by personal completion
    percentage, descending.
-   [ ] Sort unlocked achievements by unlock date, newest first.
-   [ ] Sort locked achievements by `global_percent` descending (least
    rare first); place unknown dates/percentages last.
-   [ ] Show an explicit informational state for games that do not
    support achievements.
-   [ ] Implement the platinum state when every known achievement for a
    game is unlocked and at least one achievement is known.
-   [ ] Preserve last known good data; allow `unlocked_at` and
    `global_percent` to be `NULL`.
-   [ ] Implement controller-friendly loading, stale-data, partial
    failure, and no-support states.
-   [ ] Test counters, tiers, platinum calculation, ordering, and
    idempotent synchronization.

**Acceptance:** Repeated sync creates no duplicates; closing one game
syncs only that game's achievements; full-library sync happens only
after an explicit manual action; overview and per-game lists follow the
specified ordering; unsupported games show an informational message;
failed requests do not mark all achievements locked or delete existing
data; displayed totals are calculated from actual data and are not
hardcoded from illustrative mockups.

## Phase 8 --- Hardening and release preparation

### Tasks

-   [ ] Measure startup, library rendering, image loading, and scan
    performance on reference hardware.
-   [ ] Optimize caching and progressive image loading based on
    measurements; decide artwork cache eviction and stored sizes.
-   [ ] Test controller disconnect/reconnect and input edge cases.
-   [ ] Test 1920×1080 and 1280×720.
-   [ ] Test network failures, malformed API responses, permissions, and
    interrupted sync.
-   [ ] Verify migration and backup/recovery approach.
-   [ ] Decide and configure Windows packaging/installer (D-13),
    including correct packaging of the `better-sqlite3` native module.
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

The Phase 0 decisions are confirmed (see `ARCHITECTURE.md`). Ask the coding assistant to
implement **only Phase 1 --- Project skeleton**. Do not ask it to
implement the entire roadmap in one prompt.
