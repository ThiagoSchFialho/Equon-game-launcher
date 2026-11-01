# Equon Game Launcher — Architecture

**Version:** 0.3
**Status:** Draft — Phase 0 (no production code exists yet)
**Last updated:** 2026-11-01
**Inputs:** `README.md`, `PRODUCT.md`, `DATA_BASE_CONTEXT.md`, `DESIGN_SYSTEM.md`, `ROADMAP.md`
**Purpose:** Define technical boundaries, record architecture decisions, and list what is still unresolved before implementation starts.

## How to read this document

Every decision has a status:

| Status | Meaning |
| --- | --- |
| **Accepted** | Confirmed by the project owner. Safe to build on. *(None yet.)* |
| **Proposed** | A recommendation based on the project docs, awaiting confirmation. Do not treat as final. |
| **Open** | Needs research or a prototype before a recommendation can be made. |

When a decision is confirmed, change its status to **Accepted** and add a line to the change log (section 17). The AI coding assistant must surface unresolved decisions instead of silently inventing answers.

---

## 1. Goals, scope and constraints

### MVP scope (from `PRODUCT.md`)

- Windows desktop application, designed primarily for gamepad use, with mouse and keyboard as alternatives.
- Conventional 16:9 screens (validated at 1920×1080, 1280×720 and 2560×1440). Ultrawide is not required.
- Sources in the MVP: **Steam** (local discovery, launch, metadata, achievements) and **manually added games**.
- Library features: search by title, filters (origin, installation state), sorting, manual `hidden` / `beated` flags.
- Sessions and playtime recorded by the launcher when the process can be observed.
- Achievements area: aggregate trophy counts, per-game progress, per-game achievement lists, platinum state.
- On-screen keyboard for text input with a controller.
- The application must start **without a separate local server** (`PRODUCT.md` acceptance criterion 1).

### Later phases (not MVP)

- No automatic integration with Epic Games Store or GOG is planned. Epic games and any other PC games are added manually and use `origin = manual`. Other automatic sources (e.g. Yuzu) would be considered only after a reliable method is validated and a product decision is made.
- Out of scope until a product decision says otherwise: cloud sync, accounts, multi-user, store purchases, social features, plugins/themes, auto-update, start with Windows, kiosk mode, Linux/macOS (`PRODUCT.md` §3 and §10).

### Constraints

- One local user and one configured Steam account. Do not create `USER_ACHIEVEMENTS` or multi-profile support.
- Keep the UI responsive during scans, API calls, sync and artwork loading.
- Isolate each integration so one source's failure never breaks the rest of the library.
- Preserve local and manual data. An API or scan failure is never proof that data no longer exists.
- Keep the code testable and understandable for AI-assisted development.

---

## 2. Decision log

| ID | Decision | Status | Recommendation / candidates |
| --- | --- | --- | --- |
| D-01 | Desktop framework and UI stack | Accepted | Electron + React + TypeScript; confirm with a measured spike (§3.1) |
| D-02 | Database engine | Accepted | SQLite (embedded); PostgreSQL does not fit the "no separate server" criterion (§3.2) |
| D-03 | Migration tool and data-access approach | Open | Candidates listed in §3.3 |
| D-04 | Steam API key storage | Accepted | Encrypt with Electron `safeStorage`; PRD wording needs adjusting (§3.4) |
| D-05 | Approved `origin` values | Accepted | `steam`, `manual` only; Epic/GOG games are added manually (§3.5) |
| D-06 | Unknown installation state | Accepted | Make `installed` nullable; `NULL` = unknown (§3.6) |
| D-07 | Manual-game launch configuration storage | Accepted | Dedicated table, not columns on `GAMES` (§3.7) |
| D-08 | Session model and playtime rounding | Accepted | Add a `PLAY_SESSIONS` table; derive minutes from seconds (§3.8) |
| D-09 | Where `tier` and trophy counters are computed | Accepted | Application layer, inside a transaction (§3.9) |
| D-10 | Enforcing a single `USERS` row | Accepted | `CHECK (id = 1)` at the database level (§3.10) |
| D-11 | Controller input approach | Open | Web Gamepad API behind an input abstraction; validate on hardware (§3.11) |
| D-12 | Steam discovery, launch and session observation | Open | Candidates in §3.12; must be validated on a real install |
| D-13 | Windows packaging / installer | Open | Decide in Phase 8; do not block earlier phases |
| D-14 | Package manager, test framework, lint/format | Open | Needed before Phase 1 |
| D-15 | Artwork and metadata source, cache policy | Open | Needs a decision before Phase 3 screens use real art |
| D-16 | Refresh frequency for `appdetails` metadata | Open | Not defined in any doc |

Decisions that **block Phase 1** (project skeleton): D-01, D-02, D-03, D-14.
Decisions that **block Phase 2** (database): D-02, D-03, D-05, D-06, D-08, D-09, D-10.
Decisions that **block Phase 4** (manual-game slice): D-07, D-08.

---

## 3. Decision details

### 3.1 D-01 — Desktop framework (Proposed: Electron)

`PRODUCT.md` already expresses security requirements in Electron terms (Node integration disabled, `contextIsolation`, preload API, validated IPC), and lists Electron's performance as a risk to measure. Electron is therefore the working assumption.

| | Electron + React + TypeScript | Tauri + web UI |
| --- | --- | --- |
| Strengths | One language across processes; Chromium Gamepad API; mature Windows tooling | Smaller packages; lower baseline memory |
| Costs | Larger package; higher idle memory | Rust host layer; process monitoring and registry/file access must be written in Rust |
| Fit | Matches the security text already in the PRD | Would require rewriting the PRD security section |

**Before accepting:** build a throwaway spike that renders a grid of ~200 cover images, reads a gamepad, and reports startup time and memory on reference hardware. The PRD forbids arbitrary performance numbers before measurement, so record the measured results here and then accept or reject.

### 3.2 D-02 — Database engine (Proposed: SQLite)

The current UML uses PostgreSQL-style types (`BIGSERIAL`, `TIMESTAMPTZ`), but the product is a local, single-user desktop app and `PRODUCT.md` requires startup without a separate server. A PostgreSQL service would need to be installed, configured, secured, started, and backed up on every user's machine.

**Recommendation:** SQLite. Adapt the schema deliberately (see §9); do not copy PostgreSQL types verbatim.

If PostgreSQL is chosen instead, this document must record setup, packaging, service lifecycle, security, and backups, and the PRD criterion must be revisited.

### 3.3 D-03 — Migrations and data access (Open)

Candidates (none selected): plain versioned SQL files with a small runner; a query builder such as Kysely; an ORM such as Drizzle. Whatever is chosen must provide versioned migrations, transactions, and keep SQL behind a data-access layer.

If a synchronous driver such as `better-sqlite3` is used, note that it blocks the event loop of the process it runs in (see §12).

### 3.4 D-04 — Steam API key storage (Proposed: `safeStorage`)

`DATA_BASE_CONTEXT.md` stores `steam_api_key` as `TEXT` in `USERS` and requires protection at rest "with a mechanism appropriate to Windows". `PRODUCT.md` §7 says "do not store store credentials in the MVP". These conflict (see §4).

**Recommendation:**

- Encrypt the key with Electron `safeStorage` (backed by the Windows DPAPI on Windows) and persist only the encrypted blob.
- Decrypt only inside the main process, only when making a Steam request.
- Never send the key to the renderer, never log it, never include it in error messages or URLs that get logged.
- Limitation to document: DPAPI protects against other Windows users, not against other processes running as the same user.

The Steam Web API key is an API key, not a store login. If the owner agrees, amend the PRD sentence to say so.

### 3.5 D-05 — `origin` values (Proposed)

Docs disagree: `DATA_BASE_CONTEXT.md` gives `steam`, `yuzu`, `local`; earlier architecture text said "manual". **Proposal:** only `steam` and `manual`. Games from Epic, GOG or any other launcher are added manually and use `manual`; add a new value only if a new automatic adapter is approved later. Store as `TEXT` with a `CHECK` constraint listing the allowed values, mirrored by a TypeScript union type. Confirm whether `yuzu` is still wanted.

### 3.6 D-06 — Installation state (Proposed: nullable)

`installed BOOLEAN NOT NULL DEFAULT FALSE` cannot express "could not be verified", and the PRD requires distinguishing installed / not found / unknown. **Proposal:** `installed` nullable: `1` installed, `0` confirmed not installed, `NULL` unknown. A failed read must never write `0`. Do not reuse the Steam detection method for other origins.

### 3.7 D-07 — Manual-game launch configuration (Proposed)

The UML has no field for executable, arguments, or working directory. **Proposal:** a separate table, e.g. `GAME_LAUNCH_CONFIGS(game_id PK/FK → GAMES.id ON DELETE CASCADE, executable_path NOT NULL, arguments, working_directory)`. This keeps launch data out of `GAMES`, which is shared by all origins. Treat all three values as untrusted input (§7). Update `DATA_BASE_CONTEXT.md` before implementing.

### 3.8 D-08 — Sessions and playtime rounding (Proposed)

`PRODUCT.md` §6.5 requires recording session start and end and surviving unexpected shutdown, but the schema has no place for sessions. **Proposal:**

```
PLAY_SESSIONS(
  id, game_id → GAMES.id ON DELETE CASCADE,
  started_at, ended_at NULL, duration_seconds NULL,
  status  -- 'running' | 'completed' | 'interrupted'
)
```

- Insert a `running` row when a launch is observed.
- On normal exit, set `ended_at`, `duration_seconds`, `status = 'completed'`, and update `GAMES.playtime` and `time_last_played` in one transaction.
- On startup, rows still `running` are marked `interrupted`. Whether interrupted sessions contribute time is an **open sub-decision** (default proposal: they do not, because the duration is unknown).
- Rounding: rounding each session to whole minutes loses time over many short sessions. Prefer deriving minutes from accumulated seconds. Whatever rule is chosen must be written here and covered by tests; `playtime` never goes negative.
- Open sub-decision: `PRODUCT.md` asks to distinguish launcher-measured time from store-reported statistics. If store playtime is ever imported, a source indicator will be needed.

### 3.9 D-09 — `tier` and trophy counters (Proposed: application layer)

- Compute `tier` in a pure domain function (`globalPercent → tier`), not in a database trigger. It is trivially unit-testable and keeps the rule in one place.
- Recompute `USERS` counters **from `ACHIEVEMENTS`** after each sync, in the same transaction as the achievement upserts. Never increment counters blindly (`DATA_BASE_CONTEXT.md` §6 item 10).
- Keep `CHECK (tier IN ('bronze','silver','gold'))` in the database as a safety net.

### 3.10 D-10 — Single `USERS` row (Proposed)

A primary key alone does not limit the table to one row. **Proposal:** `id INTEGER PRIMARY KEY CHECK (id = 1)`, with the repository always reading/writing `id = 1`.

### 3.11 D-11 — Controller input (Open)

Working proposal: the renderer polls the browser Gamepad API, and a thin **input abstraction** translates raw buttons/axes into semantic actions (`confirm`, `back`, `up/down/left/right`, `scroll`, `menu`). Screens and components depend only on semantic actions, never on raw button indices. This keeps mapping documented in one place, makes keyboard and mouse equivalents trivial, and makes input testable with a fake source.

Must be validated on real hardware: behavior when the window loses focus (e.g. while a game runs), disconnect and reconnect, controller models with different layouts, dead-zone and repeat-rate tuning. Also decide the spatial-navigation approach (own focus manager vs. a library); the design rules in `DESIGN_SYSTEM.md` §8 apply either way.

### 3.12 D-12 — Steam discovery, launch and observation (Open)

Candidates to validate on a real installation (do not assume they work):

- **Discovery of install folders:** locate Steam, read `steamapps/libraryfolders.vdf` for all library folders, then read `appmanifest_<appid>.acf` files. Handle multiple libraries and drives, custom paths, invalid manifests, and read errors.
- **Launch:** the `steam://rungameid/<appid>` URL protocol, constructed in the main process from a validated numeric App ID only (never from a renderer-supplied string).
- **Session observation:** Steam starts the game, so it is not a direct child of the launcher. Candidate: poll running processes for executables under the game's install directory (`installdir` from the manifest). Known risks: launchers that spawn the real game later, games that restart themselves, anti-cheat bootstrappers. Windows Job Objects can track process trees but would likely require native code.

`PRODUCT.md` explicitly does not promise perfect capture of child processes or intermediary launchers in the first version. Document the observed limitations once validated.

---

## 4. Inconsistencies found across the project docs

These should be resolved (and the affected docs updated) before or during the decisions above.

1. **API key vs "no credentials":** `USERS.steam_api_key` vs `PRODUCT.md` §7 "do not store store credentials in the MVP". See D-04.
2. **`origin` naming:** `local` / `yuzu` (database doc) vs `manual` (this document and the PRD). See D-05.
3. **Sessions without a table:** the PRD and domain model require play sessions; the schema has none. See D-08.
4. **Manual-game fields missing:** executable, arguments, working directory. See D-07.
5. **Unknown installation state:** PRD wants it; `installed` is a non-null boolean. See D-06.
6. **PostgreSQL types vs "no separate server":** see D-02.
7. **Scope drift:** the earlier version of this file listed Epic and GOG as goals; the PRD MVP covers only Steam and manual games. Epic/GOG automatic integration has since been dropped; Epic games are added manually. This version and the ROADMAP follow that decision.
8. **Broken reference:** the earlier version pointed to `docs/DATABASE.md`; the real file is `docs/DATA_BASE_CONTEXT.md`.
9. **Language:** `PRODUCT.md`, `DATA_BASE_CONTEXT.md` and `DESIGN_SYSTEM.md` are in Portuguese; `README.md`, `ROADMAP.md` and this file are in English. Pick one documentation language to avoid drift.

---

## 5. Logical layers

### Presentation (renderer)

Home, Library, Achievements, Game Details and Settings screens; controller focus and navigation; mouse/keyboard alternatives; on-screen keyboard; artwork; loading, empty, unavailable and error states. Styling uses only the tokens from `DESIGN_SYSTEM.md`. UI components must not call store APIs or database SQL directly.

### Application / use cases

Coordinates workflows: refresh library, add/edit/remove a manual game, launch a game, record a session, refresh metadata, sync achievements for one game, sync all achievements (manual only), update flags. Defines **ports** (interfaces) that infrastructure implements.

### Domain

Concepts and rules independent of UI and external APIs: game, origin, installation state, genre, achievement, tier, play session, progress. Pure functions where possible. Rules enforced here:

- Playtime is in minutes and non-negative.
- `hidden` and `beated` are never changed by synchronization.
- Tier from `global_percent` (§10); platinum condition; personal progress with a safe zero-total case.
- Sorting rules for the Achievements area (§10).

### Infrastructure

Database and migrations, filesystem scanning, process launch and monitoring, HTTP clients (timeouts, bounded retries), artwork/metadata cache, secret storage, logging and diagnostics.

### Integration adapters

One adapter per source. Each adapter declares the capabilities it supports; nothing may assume every store offers equivalent features.

---

## 6. Process model and structure

### Electron processes (if D-01 is accepted)

| Process | Responsibilities | Must not |
| --- | --- | --- |
| **Main** | Composition root, use cases, database, filesystem, process launch/monitoring, HTTP calls, secret handling, window management | Expose generic file, shell, or network access |
| **Preload** | `contextBridge` API: a small, typed set of named operations and event subscriptions | Expose raw `ipcRenderer`, Node modules, or the key |
| **Renderer** | React UI, input handling, presentation state | Use Node APIs; hold secrets; touch the database |

Window settings: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Restrict navigation and new-window creation, and apply a Content Security Policy.

### Suggested structure (illustrative, adapt to the chosen tooling)

```text
src/
  main/              # entry point, window, IPC handlers, dependency wiring
  preload/           # contextBridge API
  renderer/          # React app (no Node access)
    screens/         # home, library, achievements, game-details, settings
    components/      # game card, button, dialogs, virtual keyboard
    input/           # gamepad source, semantic actions, focus manager
    styles/          # design tokens (from DESIGN_SYSTEM.md)
  core/
    domain/          # entities and rules (pure TypeScript)
    application/     # use cases and port interfaces
  infrastructure/
    persistence/     # database, migrations, repositories
    filesystem/      # library scanning, local files
    process/         # launch and session monitoring
    security/        # secret storage
    http/            # API client wrapper (timeouts, retries, redaction)
    cache/           # artwork and metadata cache
  integrations/
    steam/
    manual/
  shared/            # IPC contracts and schemas shared by main/preload/renderer
tests/
docs/
```

### Dependency rules

- `renderer` imports only `shared` (types/contracts) and talks to the backend through the preload API.
- `core` imports nothing from Electron, the filesystem, the network, or SQL.
- `infrastructure` and `integrations` implement ports defined in `core`.
- `main` wires everything together.

---

## 7. Security

- Secrets and privileged operations stay in the main process.
- Validate every IPC payload and every external API response with explicit schemas; reject unknown shapes.
- Treat executable paths, arguments, and working directories as untrusted: validate that the path exists and is a file, never build a shell command string, and pass arguments as an array without a shell.
- Never expose arbitrary filesystem access or command execution to the renderer.
- Only open external URLs from an allowlist built in the main process (for example `steam://` URLs from a validated App ID).
- Never log API keys or URLs containing secret query parameters; redact in the HTTP client wrapper. `GetSchemaForGame` and `GetPlayerAchievements` put the key in the query string, so URL logging is a real risk.
- Use timeouts and bounded retries for external requests.

---

## 8. Integration adapter contract

Illustrative shape (not final):

```ts
interface SourceAdapter {
  id: 'steam' | 'manual';
  capabilities: {
    discovery: boolean;
    metadata: boolean;
    installationState: boolean;
    launch: boolean;
    sessionObservation: 'reliable' | 'best-effort' | 'none';
    achievements: boolean;
  };
  discover?(): Promise<DiscoveryResult>;   // games + warnings + errors
  // other operations are present only when the capability is true
}
```

A discovery result always carries warnings and errors, so partial failure is visible instead of thrown away.

### MVP capability matrix (to be confirmed by validation)

| Capability | Steam | Manual |
| --- | --- | --- |
| Discovery | Local manifests (D-12) | User adds games |
| Metadata and genres | `appdetails` | None |
| Installation state | Manifests (D-12) | To be defined; do not reuse Steam logic |
| Launch | Candidate: `steam://rungameid` | Executable + args + working dir |
| Session observation | Best-effort | Reliable for direct child processes |
| Achievements | Steam Web API | Not supported |

Games from Epic, GOG and other launchers are registered as manual games. Some may only start through their official client (login or DRM); if launching the `.exe` directly fails, the manual launch configuration may need an alternative launch method. Validate this in Phase 4 with real games.

---

## 9. Persistence

### Rules to preserve (from `DATA_BASE_CONTEXT.md`)

- `GAMES.playtime` is in minutes, `NOT NULL DEFAULT 0`, `CHECK (playtime >= 0)`.
- `GAMES.origin` identifies the source, not installation state.
- `hidden` and `beated` are manual flags, default `FALSE`, never overwritten by sync.
- `steam_id` is optional and unique when present.
- `ACHIEVEMENTS`: FK to `GAMES.id` with `ON DELETE CASCADE`; `UNIQUE (game_id, api_name)`; `tier` restricted to `bronze|silver|gold`; `unlocked_at` and `global_percent` may be `NULL`.
- `GENRES.name` unique; `GAME_GENRES` has composite PK `(game_id, genre_id)` and cascading FKs on both sides.
- `USERS` holds one row; trophy counters are non-negative aggregates that mirror persisted achievements.
- Personal progress = unlocked / total known; handle a zero total without dividing.

### Adapting the schema to SQLite (if D-02 is accepted)

| UML / PostgreSQL | SQLite adaptation |
| --- | --- |
| `BIGSERIAL`, `SERIAL` | `INTEGER PRIMARY KEY` (`AUTOINCREMENT` only if id reuse must be prevented) |
| `TIMESTAMPTZ` | `TEXT` in ISO-8601 UTC (or integer epoch); pick one and use it everywhere |
| `DATE` | `TEXT` (`YYYY-MM-DD`) |
| `BOOLEAN` | `INTEGER` with `CHECK (col IN (0,1))` |
| `VARCHAR(n)` | `TEXT` (length limits enforced with `CHECK` if needed) |
| `REAL` | `REAL` |
| `origin` | `TEXT` + `CHECK (origin IN (...))` |

SQLite-specific points that must be handled deliberately:

- Enable `PRAGMA foreign_keys = ON` on **every connection**; it is off by default, and without it the cascades above do nothing.
- A `UNIQUE` column allows multiple `NULL`s, which is the desired behavior for `steam_id`.
- Upserts use `INSERT ... ON CONFLICT (game_id, api_name) DO UPDATE`. The update clause must never touch `hidden` or `beated`.
- Specify `NULL` ordering explicitly in queries. Default placement differs between engines, and several required orderings need `NULL`s last.

### General persistence rules

- Versioned migrations; SQL stays behind repositories; related changes in one transaction.
- Back up the database file before applying a migration (recovery approach is a Phase 8 verification item).
- Tests for migrations, constraints, upserts, cascades, and transactions.

---

## 10. Achievements architecture

### Data sources (validate current formats before implementing)

- Definitions: `ISteamUserStats/GetSchemaForGame/v2` (needs the key).
- Player state: `ISteamUserStats/GetPlayerAchievements/v1` (needs key and Steam ID).
- Global rates: `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2` (confirm whether a key is required; do not assume).
- Unknown global percent is stored as `NULL`, never `0`. Privacy settings and missing data can limit results.

### Domain rules

| Rule | Definition |
| --- | --- |
| Tier | `global_percent <= 15` → `gold`; `> 15` and `< 50` → `silver`; `>= 50` → `bronze`; `NULL` → `bronze`. Values are percentages (`15.0` = 15%). |
| Platinum | A game has at least one known achievement and all known achievements are unlocked. Computed from actual rows, not from a rounded percentage. |
| Trophy counters | `gold/silver/bronze` count **unlocked** achievements of each tier; `platine` counts platinum games. Recomputed from persisted data after each sync. |
| Progress | `unlocked / total known × 100`; unavailable when the total is zero. |
| No support | A game confirmed to have no achievements shows an informational message, not a sync error. |

### Ordering (presentation rules)

- Games overview: default by `GAMES.time_last_played` descending; alternative by personal completion percentage descending. `NULL` / unknown last.
- Unlocked list: `unlocked_at` descending, `NULL` last.
- Locked list: `global_percent` descending (least rare first), `NULL` last.
- Stable tie-breakers: `display_name`, then `api_name`.

### Synchronization

1. **After a game closes** (only when the close was observed and the game supports achievements): sync **that game only**.
2. **Manual full sync:** only when the user explicitly asks. Runs in the background with progress and per-game results.
3. **Never:** periodic sync, or automatic sync of the whole library (including at startup).

Per-game sync steps: fetch definitions, player state and global percentages → validate and normalize → in **one transaction**, upsert by `(game_id, api_name)`, recompute `tier` where `global_percent` changed, recompute `USERS` counters from `ACHIEVEMENTS`. If any fetch is invalid or incomplete, change nothing, keep the last known good data, mark it as stale in the UI, and record the error. A failed request must never set `unlocked = FALSE` or delete rows. Repeating a sync with identical data must change nothing.

---

## 11. Other workflows

### Refresh library

1. The user requests a refresh.
2. Each supported adapter scans its source independently.
3. Results are converted into internal models and carry warnings/errors.
4. Known identifiers match games; ambiguous matches go to a review step and are **never silently merged**.
5. Valid changes are persisted transactionally.
6. The UI shows results and partial failures.

A failed scan must not mark every game from that source as uninstalled.

### Metadata and genres

For Steam, use `appdetails`: check the success flag, validate optional fields, normalize, then persist. Never overwrite `hidden` or `beated`, and never replace valid values with empty strings after a network or format error. Genre names are normalized to avoid duplicates. Metadata sync is separate from installation detection and session measurement. Refresh frequency: D-16.

### Launch and session

1. Validate the launch configuration (§7).
2. Invoke the adapter's launch.
3. Insert a `running` session and observe the process where feasible.
4. On exit, finalize the session and update `playtime` / `time_last_played` in one transaction (D-08), then trigger the per-game achievements sync if applicable.
5. On launch failure, show an actionable error with a retry option.

On startup, reconcile sessions left `running` by a previous crash.

---

## 12. UI architecture and performance

- Screens: Home (continue playing, recent games, shortcut to the library), Library, Achievements, Game Details, Settings. Navigation is hybrid: compact global navigation plus contextual navigation where needed.
- One focus manager owns focus. Focus must never disappear when a list updates, a filter changes, or images load; dialogs move focus in and return it on close; the app must never trap focus.
- Every screen defines default, focus, unavailable, empty, loading and error states (`DESIGN_SYSTEM.md` §11).
- The on-screen keyboard is a first-class component, used by search and any text field.
- Images: load progressively, request appropriate sizes, cache on disk, and avoid loading every high-resolution cover at once. Use placeholders for missing art. The art source and cache policy are D-15.
- Long lists: consider virtualization; decide based on measurement.
- Background work (scans, sync) must not block rendering. A synchronous SQLite driver blocks the process it runs in, so keep transactions short and measure; if blocking shows up, move database or scan work to a worker or utility process.
- Do not set numeric performance budgets before measuring a prototype on reference hardware (PRD rule).
- Animate `transform` and `opacity` only; respect a reduced-motion setting.

---

## 13. Reliability

- An unavailable store never prevents the launcher from opening.
- Each integration reports its own diagnostics.
- Treat failures as partial failures; never delete valid data because a request failed.
- Make synchronization safe to repeat.
- Use migrations for every schema change.

---

## 14. Testing strategy

- **Unit:** tier calculation, platinum detection, progress with zero total, ordering with `NULL`s, playtime/rounding rules, API response mapping.
- **Persistence:** migrations, constraints, upserts, cascades, transactions, foreign keys actually enabled, manual flags preserved across upserts.
- **Integration:** adapters against fixtures (sample `libraryfolders.vdf`, `appmanifest_*.acf`, `appdetails` and achievement responses) and simulated failures (timeouts, malformed JSON, privacy-restricted profiles).
- **Application:** library refresh with partial failure, launch failure, per-game sync after close, manual full sync, idempotent repeated sync, crash recovery of running sessions.
- **UI / manual on Windows:** controller focus, disconnect/reconnect, window focus loss, multiple Steam libraries, intermediary launchers, 1920×1080, 1280×720 and 2560×1440.

Routine tests must not call live Steam endpoints; keep a separate real-world verification checklist.

---

## 15. Known risks and limitations

- Steam discovery and launch methods can change.
- Some manually added games (e.g. from Epic) may require their official client to start; direct `.exe` launch may fail for them.
- Process observation can miss child processes and intermediary launchers; session time is best-effort for Steam games.
- Electron's size and memory use are unmeasured (D-01).
- Gamepad behavior varies by controller and by window focus; needs hardware validation.
- Steam API responses, privacy settings and rate limits may limit achievement data; validate current behavior before implementing.
- Artwork and metadata sources may involve API keys and terms of use (D-15).

---

## 16. Implementation order

Follows `ROADMAP.md`. Do not generate the application skeleton until D-01, D-02, D-03 and D-14 are **Accepted** and recorded here. The first coding task should be **Phase 1 — Project skeleton only**; do not ask for the whole roadmap in one prompt.

### Definition of done

A change is ready when it meets its acceptance criteria, respects layer boundaries and security rules, includes tests proportional to risk, handles partial failures, adds no unjustified dependencies, updates affected docs (including this file when a decision changes), and states its manual validation steps and known limitations.

---

## 17. Change log

| Date | Version | Change |
| --- | --- | --- |
| 2026-10-25 | 0.1 | Initial draft with unresolved decisions |
| 2026-11-01 | 0.2 | Aligned with updated PRD, database context, design system and roadmap; added decision log with recommendations, cross-document inconsistencies, Electron process model, SQLite adaptation, achievements architecture, session model proposal |
| 2026-11-01 | 0.3 | Dropped Epic/GOG automatic integration (D-17 removed); Epic games are added manually with `origin = manual`; roadmap phases renumbered |