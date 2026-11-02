# Equon Game Launcher — Architecture

**Version:** 0.16
**Status:** Draft — Phase 5 (library organization)
**Last updated:** 2026-11-02
**Inputs:** `README.md`, `PRODUCT.md`, `DATA_BASE_CONTEXT.md`, `DESIGN_SYSTEM.md`, `ROADMAP.md`
**Purpose:** Define technical boundaries, record architecture decisions, and list what is still unresolved before implementation starts.

## How to read this document

Every decision has a status:

| Status | Meaning |
| --- | --- |
| **Accepted** | Confirmed by the project owner. Safe to build on. |
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

- No automatic integration with Epic Games Store or GOG is planned. Epic games and any other PC games are added manually and use `origin = manual`. Emulated games (Yuzu, PlayStation 2 and any origin the user creates, such as Nintendo 64) are also added manually under their own origin (D-05). Automatic discovery for any source other than Steam would be considered only after a reliable method is validated and a product decision is made.
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
| D-03 | Migration tool and data-access approach | Accepted | Plain versioned SQL migrations + small runner; `better-sqlite3`; hand-written SQL in repositories (§3.3) |
| D-04 | Steam API key storage | Accepted | Encrypt with Electron `safeStorage`; PRD wording needs adjusting (§3.4) |
| D-05 | Game origins | Accepted | Extensible `ORIGINS` table: built-in `steam`, `manual`, `yuzu`, `ps2`; the user can add more. Only `steam` has an automatic adapter (§3.5) |
| D-06 | Unknown installation state | Accepted | Make `installed` nullable; `NULL` = unknown (§3.6) |
| D-07 | Manual-game launch configuration storage | Accepted | Dedicated table, not columns on `GAMES` (§3.7) |
| D-08 | Session model and playtime rounding | Accepted | Add a `PLAY_SESSIONS` table; derive minutes from seconds; Steam playtime synced at every launcher start (§3.8) |
| D-09 | Where `tier` and trophy counters are computed | Accepted | Application layer, inside a transaction (§3.9) |
| D-10 | Enforcing a single `USERS` row | Accepted | `CHECK (id = 1)` at the database level (§3.10) |
| D-11 | Controller input approach | Accepted | Browser Gamepad API (polled) behind an input abstraction; validate on hardware (§3.11) |
| D-12 | Steam discovery, installation state and running state | Accepted | Read `libraryfolders.vdf` + `appmanifest_*.acf` `StateFlags`, with the safeguards in §3.12 |
| D-13 | Windows packaging / installer | Open | Decide in Phase 8; do not block earlier phases |
| D-14 | Package manager, build tool, test framework, lint/format | Accepted | npm; electron-vite; Vitest; ESLint + Prettier; TypeScript `strict` (§3.15) |
| D-15 | Artwork sources and cache policy | Accepted | SteamGridDB (API key) + Steam `appdetails`; local file picker as fallback; Google Images not adopted (§3.13) |
| D-16 | Refresh frequency for `appdetails` metadata | Accepted | Fetched only when a game is discovered/added; failed fetches are retried (§3.14) |
| D-17 | Steam launch mechanism | Accepted | `steam://rungameid/<appid>`, built in the main process (§3.12) |

Decisions that **block Phase 1** (project skeleton): D-01, D-02, D-03, D-14.
Decisions that **block Phase 2** (database): D-02, D-03, D-05, D-06, D-08, D-09, D-10.
Decisions that **block Phase 4** (manual-game slice): D-07, D-08.
Decisions that **block Phase 6** (Steam library and metadata): D-12, D-16, D-17 (all accepted).

**Phase 1 is unblocked:** D-01, D-02, D-03 and D-14 are all accepted. The only decision still open is D-13 (installer, Phase 8). The Home cover question is settled: a separate `cover_portrait` art type (§3.13).

---

## 3. Decision details

### 3.1 D-01 — Desktop framework (Accepted: Electron)

`PRODUCT.md` already expresses security requirements in Electron terms (Node integration disabled, `contextIsolation`, preload API, validated IPC), and lists Electron's performance as a risk to measure. Electron is therefore the working assumption.

| | Electron + React + TypeScript | Tauri + web UI |
| --- | --- | --- |
| Strengths | One language across processes; Chromium Gamepad API; mature Windows tooling | Smaller packages; lower baseline memory |
| Costs | Larger package; higher idle memory | Rust host layer; process monitoring and registry/file access must be written in Rust |
| Fit | Matches the security text already in the PRD | Would require rewriting the PRD security section |

**Validation task (does not block):** early in Phase 1, build a throwaway spike that renders a grid of ~200 cover images, reads a gamepad, loads the SQLite native module, checks whether the chosen Electron version bundles a Node that provides `node:sqlite` (see §3.3), and reports startup time and memory on reference hardware. The PRD forbids arbitrary performance numbers before measurement, so record the measured results here. If they are unacceptable, reopen this decision.

**Phase 1 spike results (2026-11-01).** Code kept on the unmerged branch `spike/phase1-validation`.

- Machine: AMD Ryzen 5 5500, 32 GB RAM, AMD Radeon RX 6600, NVMe SSD, Windows 11 Pro. Owner to confirm whether this is the reference hardware.
- Runtime: Electron 44.10.1 (Chromium 152, Node 24.22.1, ABI 149), unpackaged production build (`electron-vite build` + `electron .`), warm disk cache.
- Startup, process start → first visible frame: about 340 ms without the grid (3 runs: 334–344 ms); about 485 ms with the 200-cover grid (5 runs: 461–519 ms). App ready at about 160 ms in both cases.
- Memory (sum of working sets from `app.getAppMetrics()`, 3 s after load): about 344 MB without the grid; about 490 MB with 200 covers loaded at once (renderer ~215 MB, GPU ~115 MB, browser ~113 MB, utility ~50 MB).
- Covers: 200 generated 600×900 PNGs at about 680 KB each (131 MB total; pessimistic compared with typical art), all loaded eagerly with no lazy loading or virtualization. All 200 had loaded by first show.
- SQLite: `better-sqlite3` 13.0.3 loads in the Electron main process without a rebuild (SQLite 3.53.4, `foreign_keys = 1`; load + 10 000 inserts in one transaction ≈ 32 ms). `node:sqlite` is also available in this Electron (SQLite 3.53.4).
- Gamepad: with the window's permission handlers denying everything, `navigator.getGamepads()` works. An Xbox 360 controller (XInput) was listed with `mapping = "standard"`, 17 buttons and 4 axes; resting axes read up to about ±0.05, so a dead zone is needed. The owner verified on hardware that every button, both triggers and both analog sticks are read correctly. Disconnect/reconnect and window-focus loss are still to be checked in Phase 3.
- Assessment: no reason to reopen D-01 or D-03. Memory grows with eagerly loaded covers, which supports lazy loading/virtualization decisions in Phase 3/8 (§12). These are first measurements, not budgets.

### 3.2 D-02 — Database engine (Accepted: SQLite)

The current UML uses PostgreSQL-style types (`BIGSERIAL`, `TIMESTAMPTZ`), but the product is a local, single-user desktop app and `PRODUCT.md` requires startup without a separate server. A PostgreSQL service would need to be installed, configured, secured, started, and backed up on every user's machine.

**Recommendation:** SQLite. Adapt the schema deliberately (see §9); do not copy PostgreSQL types verbatim.

If PostgreSQL is chosen instead, this document must record setup, packaging, service lifecycle, security, and backups, and the PRD criterion must be revisited.

### 3.3 D-03 — Migrations and data access (Accepted)

Chosen by Claude at the owner's request to pick the best fit.

- **Migrations:** plain, versioned `.sql` files (e.g. `0001_init.sql`) applied in order by a small runner that records the applied version with SQLite `PRAGMA user_version` and runs each migration inside a transaction. Some SQLite changes cannot be made in place and need the create-copy-rename pattern, with foreign keys switched off outside the transaction (the pragma has no effect inside one).
- **Driver:** `better-sqlite3`. It is a native module: it must be rebuilt for Electron and packaged correctly, which the Phase 1 spike must confirm. Its API is synchronous (see §12).
- **Data access:** hand-written SQL inside repositories (one per aggregate) that return domain types. No ORM. SQL lives only in `infrastructure/persistence`.

**Why:** no extra dependencies; the schema relies on SQLite-specific details (CHECK constraints, `ON CONFLICT` upserts, explicit `NULL` ordering, pragmas) that are clearest in plain SQL; migrations are easy to review; repositories can be tested against a real in-memory SQLite database.

**Native-module caveat:** older `better-sqlite3` versions were compiled for one Node ABI at a time. Since v13 the package uses N-API and ships prebuilt binaries, so one binary loads under both the system Node (tests) and Electron (app); see §3.15. Phase 1 confirmed this and also that Electron 44 provides `node:sqlite`. D-03 stays as is: `node:sqlite` is still "release candidate" and the rebuild cost that motivated a switch no longer exists.

**Trade-off:** SQL is not checked at compile time. Mitigation: repository tests against real SQLite. If this becomes painful, Kysely (query builder with a migrator) is the upgrade path, because repositories are the only place SQL exists. Drizzle was not chosen: schema-first generation adds a layer between the documented schema and the real constraints.

### 3.4 D-04 — Steam API key storage (Accepted: `safeStorage`)

`DATA_BASE_CONTEXT.md` stores `steam_api_key` as `TEXT` in `USERS` and requires protection at rest "with a mechanism appropriate to Windows". `PRODUCT.md` §7 says "do not store store credentials in the MVP". These conflicted (see §4); resolved by the decision below and by the updated documents.

**Recommendation:**

- Encrypt the key with Electron `safeStorage` (backed by the Windows DPAPI on Windows) and persist only the encrypted blob.
- Decrypt only inside the main process, only when making a Steam request.
- Never send the key to the renderer, never log it, never include it in error messages or URLs that get logged. The same mechanism stores the SteamGridDB key if D-15 is accepted.
- Limitation to document: DPAPI protects against other Windows users, not against other processes running as the same user.

The Steam Web API key is an API key, not a store login. If the owner agrees, amend the PRD sentence to say so.

### 3.5 D-05 — Game origins (Accepted: extensible table)

Origins are **data, not a fixed enum** (owner decision, Phase 2). An `ORIGINS` table holds a stable `key`, an editable display `name` and a `builtin` flag (`DATA_BASE_CONTEXT.md` §3.10). `GAMES.origin` stores the key as `TEXT` with a foreign key to `ORIGINS(key)` (`ON DELETE RESTRICT`).

- Built-in rows created by the first migration: `steam` ("Steam"), `manual` ("PC"), `yuzu` ("Yuzu"), `ps2` ("PlayStation 2"). Built-in origins cannot be deleted.
- The user can create, rename and delete their own origins (for example "Nintendo 64" for a new emulator). An origin that still has games cannot be deleted. Keys never change after creation.
- **Only `steam` has an automatic adapter** (discovery, metadata, achievements). Every other origin, built-in or user-created, behaves as a manually added game: the user registers the game and its launch configuration (an `.exe` or `.url` shortcut; for Yuzu games, the ROM). The user never picks `steam` when adding a game.
- Games from Epic, GOG or any other PC launcher use `manual`.
- TypeScript: the origin is a `string` key; built-in keys are constants, and adapter capabilities are keyed by `steam` only.
- **Emulators (decided in Phase 4):** emulators are a separate feature, not origin settings. An `EMULATORS` table stores the executable the user configured per supported emulator (only **Yuzu** for now; Library → "Emuladores"). A Yuzu game (origin `yuzu`) stores only its ROM path; at launch main builds `yuzu.exe -f -g "<rom>"` as an argument array, so changing `yuzu.exe` applies to every Yuzu game. The built-in `manual` origin is displayed as "Jogo Local" (migration `0002`). Details: `DATA_BASE_CONTEXT.md` §3.7 and §3.12.
- **`.url` shortcuts (decided in Phase 4):** a manual game may point to a Windows internet shortcut. Main reads its `URL=` line and only accepts the schemes `com.epicgames.launcher:`, `steam:`, `uplay:`, `origin2:`, `link2ea:` and `battlenet:` (checked when saving and again when launching), then opens it through Electron's external-URL mechanism. No process is observed, so **no playtime is measured** for these games.

### 3.6 D-06 — Installation state (Accepted: nullable)

`installed BOOLEAN NOT NULL DEFAULT FALSE` cannot express "could not be verified", and the PRD requires distinguishing installed / not found / unknown. **Proposal:** `installed` nullable: `1` installed, `0` confirmed not installed, `NULL` unknown. A failed read must never write `0`. Do not reuse the Steam detection method for other origins.

### 3.7 D-07 — Manual-game launch configuration (Accepted)

The UML has no field for executable, arguments, or working directory. **Proposal:** a separate table, e.g. `GAME_LAUNCH_CONFIGS(game_id PK/FK → GAMES.id ON DELETE CASCADE, executable_path NOT NULL, arguments, working_directory)`. This keeps launch data out of `GAMES`, which is shared by all origins. It applies to every origin except `steam` (built-in emulator origins and user-created origins included). Treat all three values as untrusted input (§7). Defined in `DATA_BASE_CONTEXT.md` §3.7.

### 3.8 D-08 — Sessions and playtime rounding (Accepted)

`PRODUCT.md` §6.5 requires recording session start and end and surviving unexpected shutdown, but the schema has no place for sessions. **Proposal:**

```
PLAY_SESSIONS(
  id, game_id → GAMES.id ON DELETE CASCADE,
  started_at, last_seen_at, ended_at NULL, duration_seconds NULL,
  status  -- 'running' | 'completed' | 'interrupted'
)
```

- Insert a `running` row when a launch is observed.
- On normal exit, set `ended_at`, `duration_seconds`, `status = 'completed'`, and update `GAMES.playtime` and `time_last_played` in one transaction.
- **Every observed session counts toward playtime**, whatever the origin and however the game was closed (owner decision, Phase 2). A game that is force-closed or crashes is still observed ending, so its session completes normally.
- **Heartbeat:** while observing a running game, the launcher periodically updates `last_seen_at` (about every 30 s; the final interval is set by measurement in Phase 4). If the launcher itself dies (crash, power loss, Windows shutdown), on the next startup each row still `running` becomes `interrupted` with `ended_at = last_seen_at` and `duration_seconds = last_seen_at − started_at`, in the same transaction that recomputes `playtime`. At most one heartbeat interval is lost.
- Rounding: rounding each session to whole minutes loses time over many short sessions. **Rule:** `GAMES.playtime = floor(sum of duration_seconds of the game's completed and interrupted sessions / 60)`, recomputed in the same transaction that closes the session (idempotent; see `DATA_BASE_CONTEXT.md` §3.8). Covered by tests; `playtime` never goes negative.
- **User-entered playtime (Phase 4).** For non-Steam games, the add/edit form accepts the time already played elsewhere; it is stored in `games.playtime_offset` and `playtime = playtime_offset + floor(seconds of counted sessions / 60)`.
- **Steam playtime (owner decision, Phase 2).** For Steam games, Steam is the source of truth for total playtime and last played, since it covers other computers and time before Equon. Once **per launcher start**, a single `IPlayerService/GetOwnedGames` call (key + SteamID64; validate the current format first) overwrites, for every Steam game already in the database, `time_last_played` and a stored baseline (`steam_playtime_baseline`, `steam_synced_at`). Then `playtime = baseline + floor(seconds of counted sessions started since the sync / 60)`, so sessions in the current run add on top and the next start overwrites again without double counting. Startup order: close interrupted sessions first, then sync. A failed sync changes nothing. This is the only automatic sync at startup; achievements keep the rules in §10. Other origins use launcher time only. Details: `DATA_BASE_CONTEXT.md` §3.11.

### 3.9 D-09 — `tier` and trophy counters (Accepted: application layer)

- Compute `tier` in a pure domain function (`globalPercent → tier`), not in a database trigger. It is trivially unit-testable and keeps the rule in one place.
- Recompute `USERS` counters **from `ACHIEVEMENTS`** after each sync, in the same transaction as the achievement upserts. Never increment counters blindly (`DATA_BASE_CONTEXT.md` §6 item 10).
- Keep `CHECK (tier IN ('bronze','silver','gold'))` in the database as a safety net.

### 3.10 D-10 — Single `USERS` row (Accepted)

A primary key alone does not limit the table to one row. **Proposal:** `id INTEGER PRIMARY KEY CHECK (id = 1)`, with the repository always reading/writing `id = 1`.

### 3.11 D-11 — Controller input (Accepted: browser Gamepad API)

Use the standard Gamepad API available in the renderer. Important detail: the browser only raises `gamepadconnected` / `gamepaddisconnected` **events**. Button and axis state is not event-driven; it must be read by polling `navigator.getGamepads()` once per animation frame.

So a small input module in `renderer/input/`:

- Polls the pads, detects press/release edges, applies dead zones, and repeats held directions at a controlled rate.
- Emits **semantic actions** (`confirm`, `back`, `up/down/left/right`, `scroll`, `menu`, `previousSection`/`nextSection` for LB/RB). Screens and components depend only on these actions, never on raw button indices. The mapping table lives in `DESIGN_SYSTEM.md` §8.
- Maps keyboard and mouse to the same actions.
- Accepts a fake source so input can be unit-tested.
- Phase 4 adds `secondary` (X), `tertiary` (Y), `leftTrigger` (LT) and `rightTrigger` (RT), used by the on-screen keyboard (backspace, space, shift, done). While a text field is being edited, physical-keyboard characters, Backspace and Enter go to the text instead of being mapped to actions.
- A focusable may consume directions itself (`onDirection`), e.g. the date picker uses up/down to change values.

Validate on real hardware: a pad only appears after the first button press or movement; behavior when the window loses focus (e.g. while a game runs); disconnect and reconnect; layouts that do not report the `standard` mapping; dead-zone and repeat-rate tuning. Spatial navigation (decided in Phase 3): an **own focus manager** (no dependency), one per app, that picks the nearest focusable element in the pressed direction, remembers focus per screen and restores it when a dialog closes. The rules in `DESIGN_SYSTEM.md` §8 apply.

### 3.12 D-12 — Steam discovery, installation state and running state (Accepted)

**Approach (accepted):** derive everything local from Steam's own files.

1. Locate Steam.
2. Read `steamapps/libraryfolders.vdf` to list library folders.
3. Read every `appmanifest_<appid>.acf` in each library's `steamapps` folder.
4. Interpret the manifest `StateFlags` bitmask to obtain installed, update-required, running, installing, paused and unhealthy states.

The reference implementation (a prototype using an Express router) already does this; it must be adapted as described below and **must not be copied as-is**.

**StateFlags used** (community-documented values, not an official Valve contract; verify on real installs and pin them with fixtures):

| Flag | Value | Used for |
| --- | --- | --- |
| UpdateRequired | 2 | needs update |
| FullyInstalled | 4 | installed |
| FilesMissing | 32 | unhealthy |
| AppRunning | 64 | running |
| FilesCorrupt | 128 | unhealthy |
| UpdateRunning | 256 | installing/updating |
| UpdatePaused | 512 | paused |
| UpdateStarted | 1024 | installing/updating |
| AddingFiles | 262144 | installing/updating |
| Preallocating | 524288 | installing/updating |
| Downloading | 1048576 | installing/updating |
| Staging | 2097152 | installing/updating |
| Committing | 4194304 | installing/updating |

**Required adaptations:**

- **No local server.** Drop the HTTP routes. Implement pure parsing functions plus a `SteamAdapter` (capability contract, §8) called by use cases through IPC. The adapter does not know about the database.
- **Find Steam on Windows properly.** Read the install path from the registry value `SteamPath` under `HKCU\Software\Valve\Steam`, fall back to the default install folder, and allow a user override in Settings (`PRODUCT.md` §6.7). Remove the macOS/Linux branches. If Steam is not found, report it as a warning and change no data. How to read the registry (spawning `reg query` without a shell, or a small dependency) is an implementation detail to settle in Phase 6.
- **A failed read is not an uninstall.** The prototype swallows read errors and then marks every game missing from the scan as not installed. That breaks the project rule. Instead, each library returns `ok` or `unreadable` with the error, and the adapter returns warnings. When writing results:
  - games found in the scan → `installed = 1`;
  - games absent from the scan → `installed = 0` **only if** `libraryfolders.vdf` and every listed library were read successfully; otherwise → `installed = NULL` (unknown), for example when a drive holding a library is disconnected;
  - if Steam itself was not found, update nothing.
- **Only installation state is persisted.** `GAMES.installed` stays tri-state (D-06). Transient states (running, installing, updating, paused, update required, unhealthy) are read live and shown in the UI; they are not stored.
- **Filter non-games.** Manifests also exist for tools such as Steamworks Common Redistributables. Ignore known tool App IDs and/or confirm the `type` from `appdetails`; validate which approach works.
- **Return a list of running apps** instead of the first match, even though normally only one runs.
- **Parsing.** The regex approach is acceptable for the few fields needed, but names can contain escaped characters and formats can vary. Cover this with fixtures, or use a small VDF parser if the regexes prove fragile.
- **Scope.** This only finds games that have a manifest (installed or being installed). Owned-but-not-installed games would need the `GetOwnedGames` endpoint (requires the key), which is not part of the MVP docs.

**Running state and sessions:** the `AppRunning` flag lets the launcher notice a game starting and stopping, including games started from Steam itself. Candidate mechanism: poll the manifests (or watch the `steamapps` folders for changes, if reliable on Windows) and treat transitions as session start/end. Interval or watcher choice is decided by measurement. Treat the result as **best-effort**: the flag is Steam-internal and may lag or go stale if a game crashes or Steam closes. Validate those cases, and keep process polling of the game's install folder (`installdir` from the manifest) as a fallback. Document observed limits; the PRD does not promise perfect capture.

**Launch (D-17, Accepted):** launch Steam games with the URL protocol `steam://rungameid/<appid>`.

- The URL is built in the main process from a validated numeric App ID taken from the database, never from a string supplied by the renderer. It is opened through Electron's external-URL mechanism, restricted to this exact pattern (see §7).
- Opening the URL only asks Steam to start the game; it does not prove the game started. Treat the launch as successful when the manifest `AppRunning` flag is observed (D-12) within a timeout. If it is not, show an actionable error with a retry option. The timeout is set by measurement, not guessed.
- Offer **Play** only when `installed = 1`. For `NULL` (unknown), warn instead of launching blindly. If the game is updating or installing, show that state rather than launching.
- If Steam is not running, the protocol is expected to start the client; validate this behavior and its delay on a real install.
- A session starts when `AppRunning` is observed, not when the URL is opened.

### 3.13 D-15 — Artwork sources and cache (Accepted)

Each game needs five images: a **square cover** (Library), a **portrait cover 600×900** (Home), a **logo**, a **1920×1080 image**, and a **header image**. The two covers are independent assets; neither is cropped from the other.

| Asset | Steam games | Manual games |
| --- | --- | --- |
| Square cover (`cover_square`) | SteamGridDB grids, filtered to square dimensions, looked up by Steam App ID | SteamGridDB name search; the user confirms the match. Otherwise a local file |
| Portrait cover (`cover_portrait`, 600×900) | SteamGridDB grids, filtered to 600×900, looked up by Steam App ID. `appdetails` has no vertical cover; Steam's own CDN asset for it is undocumented and must not be relied on | Same as the square cover |
| Logo | SteamGridDB logos | Same as cover |
| 1920×1080 | `screenshots[].path_full` from `appdetails` (usually 1920×1080; verify real dimensions after download) | A local file chosen by the user. SteamGridDB heroes are wide banners, not 16:9 (verify dimensions), so use them only as a fallback with `cover` fit |
| Header | `header_image` from `appdetails` | SteamGridDB horizontal grid (460×215 / 920×430) or a crop of the 1920×1080 image |

**SteamGridDB (adopted).** REST API v2 at `https://www.steamgriddb.com/api/v2`, `Authorization: Bearer <key>`. The key is free but requires a SteamGridDB account. Supports lookup by Steam App ID or SteamGridDB game ID, name search (needed for non-Steam games), and filters by dimensions and style. Art is community-contributed. A third-party document reports about 500 requests per hour on the free tier; this is not confirmed, so verify it and design for throttling.

**Steam `appdetails` (adopted).** Provides `header_image` and `screenshots`. Validate the success flag and treat every field as optional. Steam's own CDN asset names (library capsule, hero, logo images) exist but are undocumented; do not rely on them without validation.

**Google Images (not adopted).**
- The official Custom Search JSON API is closed to new customers and is discontinued on 2027-01-01.
- Scraping Google Images breaks Google's terms and is fragile.
- Third-party search APIs cost money and need another key.
- Results are arbitrary copyrighted images with unpredictable sizes and a real risk of showing the wrong game.
- The need "use any image I find" is covered better by letting the user **pick a local file** (and, possibly later, paste a validated `https` URL).

**Rules**
- The SteamGridDB key is per user, set in Settings, encrypted with `safeStorage` (D-04), and never sent to the renderer or logged. Do not embed a shared key in the app; a proxy server contradicts the no-server requirement.
- Fetch lazily when a game is added or discovered, through a throttled queue with bounded retries. Never block the UI. The app must be fully usable with placeholders and with no key configured (Steam games still get `header_image` and screenshots).
- Cache on disk in the app data folder, one file per game per kind. Never hotlink remote images at runtime. Serve cached files to the renderer through a controlled mechanism, not arbitrary file paths: a privileged `equon-art://game/<gameId>/<kind>` protocol handled in main, which looks up `GAME_ARTWORK`, resolves `local_path` inside the artwork cache folder (rejecting anything outside it) and serves the file. The CSP allows that scheme for images only.
- Persistence: table `GAME_ARTWORK`, with kinds `cover_square`, `cover_portrait`, `logo`, `background` and `header`; defined in `DATA_BASE_CONTEXT.md` §3.9.
- Artwork the user selected is never overwritten by an automatic fetch (same principle as `hidden` / `beated`). Refresh only on an explicit action or when art is missing.
- A failed fetch keeps the existing cached art. Validate every download (content type, maximum size, decoded dimensions) before saving.
- Do not bundle or redistribute fetched images; the cache is personal and local.

**Open sub-decisions:** cache eviction; stored sizes/variants (decide after measuring); the fallback look when a game has no 1920×1080 image; Picking files (decided in Phase 4): an **own controller-friendly file browser**. Main lists drives, a few known folders, folder names and only files with the allowed extensions (`.exe`/`.url` for game executables, `.exe` for emulators, Yuzu ROM formats for ROMs, `.png`/`.jpg`/`.jpeg`/`.webp` for images); it never returns file contents, and the chosen path is validated again in main when saving. A "Usar janela do Windows" button opens the native dialog for mouse users. Local artwork import: main reads the file (max 20 MB), checks the real type by its magic bytes, decodes it to get the dimensions, checks the kind's proportion (background 16:9, ±5%), copies it into the cache and saves it with `user_selected = 1`.

### 3.14 D-16 — `appdetails` refresh frequency (Accepted: once, on discovery)

Steam metadata (title, description, developer, release date, age rating, genres) is fetched from `appdetails` **only when a game is first discovered or added**. There is no periodic refresh and no refresh at launcher startup.

Consequences and rules:

- A game already in the database is not fetched again when it is re-discovered by a later library scan.
- Metadata can become stale if Steam changes it. This is accepted.
- A failed fetch (network error, unsuccessful response, malformed data) must not count as "done". The game stays marked as missing metadata and the fetch is retried on a later library refresh, with bounded retries and without blocking the UI. A game that genuinely has no description is different from a game whose fetch failed, so the database needs a way to tell them apart. **Decision:** a nullable `GAMES.metadata_fetched_at` timestamp, set only after a valid response is saved (see `DATA_BASE_CONTEXT.md` §3.1).
- When a first scan finds many games, fetches go through a throttled queue; a third-party source reports a limit of roughly 200 requests per 5 minutes for this endpoint (not confirmed, verify).
- Fetching never overwrites `hidden` or `beated`, and never replaces valid stored values with empty ones.
- Achievement synchronization is separate and unaffected (§10).
- Artwork (D-15) follows the same moment: fetched when the game is discovered or added, then cached.

Whether to offer a manual "refresh metadata" action for a single game is not decided; it would be an explicit user action, not an automatic refresh.

### 3.15 D-14 — Tooling (Accepted)

| Item | Decision |
| --- | --- |
| Package manager | **npm**, with the lockfile committed. Ships with Node and has the fewest packaging surprises with Electron and native modules. |
| Runtime versions | Pin the Node version (`.nvmrc` and `engines`) and the exact Electron version. |
| Build tool | **electron-vite**: separate builds for main, preload and renderer, matching §6. Before adopting, check that the project is actively maintained; fallback: the Electron Forge Vite template. Packaging (installer) stays a separate decision (D-13). |
| Language | TypeScript with `strict: true`; `tsc --noEmit` as the typecheck script. |
| Tests | **Vitest** for domain, application, persistence and adapter tests. React Testing Library + jsdom for renderer components (added in Phase 3). Playwright in Electron mode for a smoke test later (not in Phase 1). |
| Dev data | `npm run dev` uses a separate user-data folder (`equon-game-launcher-dev`) so development never touches the real library. `npm run dev:seed` fills it with sample games and locally generated artwork. |
| Lint / format | **ESLint** (flat config, `typescript-eslint`, React hooks plugin) and **Prettier**. |
| Scripts | `dev`, `build`, `test`, `lint`, `typecheck`, `format`. |
| Git hooks | None for now, to avoid unjustified dependencies. |

**Enforce the layer rules with lint.** Use `no-restricted-imports` (per-folder overrides) so that the rules in §6 fail the build instead of relying on discipline: `renderer` may not import `infrastructure`, `integrations` or `main`; `core` may not import `electron`, Node built-ins for filesystem/process, network libraries, or SQL drivers.

**Native-module rule.** `better-sqlite3` ≥ 13 uses N-API and ships prebuilt binaries (`prebuilds/win32-x64.node`), so the same binary serves Node (tests) and Electron (the app) with **no rebuild**. Verified in Phase 1 with Node 24.18 and Electron 44.10.1 (Node 24.22.1, ABI 149). Consequences:

- There are no rebuild scripts, and `postinstall` does not run `electron-builder install-app-deps` (it compiled the module from source with node-gyp for no benefit and would fail on machines without a C++ toolchain).
- `tests/native/better-sqlite3.test.ts` loads the module under Node and under the pinned Electron runtime. If a future version drops the N-API prebuilds, that test fails, and rebuild scripts (`@electron/rebuild` for Electron, `npm rebuild` for Node) must be reinstated.
- A `NODE_MODULE_VERSION` error would mean the above changed; it is not a code bug.
- Packaging the module (asar unpack) is verified in Phase 8 (D-13).

---

## 4. Inconsistencies found across the project docs

Items 1–6 have accepted decisions (D-02, D-04 to D-08) and are now reflected in `DATA_BASE_CONTEXT.md` v0.2 and `PRODUCT.md` v0.2. Item 7 follows the Epic/GOG decision. Items 8–9 are housekeeping; item 9 (documentation language) is still open.

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
- Only open external URLs from an allowlist built in the main process (for example `steam://` URLs from a validated App ID, or the store schemes accepted in `.url` shortcuts, §3.5).
- Never log API keys or URLs containing secret query parameters; redact in the HTTP client wrapper. `GetSchemaForGame` and `GetPlayerAchievements` put the key in the query string, so URL logging is a real risk.
- Use timeouts and bounded retries for external requests.

---

## 8. Integration adapter contract

Defined in Phase 5 in `src/core/application/discovery.ts` (pure, tested with fake adapters; the Steam adapter implements it in Phase 6):

```ts
interface IntegrationAdapter {
  readonly source: OriginKey;              // 'steam', the only automatic adapter (D-05)
  readonly capabilities: { installState; launch; playtime; achievements; metadata };
  discover(): Promise<DiscoveryResult>;
}
type DiscoveryResult =
  | { status: 'complete'; games: DiscoveredGame[] }   // every location read
  | { status: 'partial'; games: DiscoveredGame[]; reason: string }
  | { status: 'failed'; reason: string };
```

- `runDiscovery(adapter)` turns a throwing adapter into a `failed` result, so one integration never breaks the rest.
- `planDiscovery(source, result, existingGames, externalIdOf)` returns upserts, install-state changes and duplicate candidates. `failed` changes nothing; known games absent from a `complete` scan become `installed = 0`, from a `partial` scan `NULL` (DATA_BASE_CONTEXT.md §3.2).
- Duplicate candidates are discovered games whose normalized title (`titleMatchKey`: case, accents, ™/®/© and punctuation ignored) matches a game of another origin. They are only reported for the review step; nothing is merged automatically.

### MVP capability matrix (to be confirmed by validation)

| Capability | Steam | Manual (every other origin, incl. emulators) |
| --- | --- | --- |
| Discovery | `libraryfolders.vdf` + manifests (D-12) | User adds games |
| Metadata and genres | `appdetails` | None |
| Installation state | Manifest `StateFlags`, tri-state (D-12) | Executable exists → 1, missing → 0, read error → unknown (Phase 4) |
| Launch | `steam://rungameid/<appid>` (D-17) | Executable + args + working dir |
| Session observation | Best-effort: manifest `AppRunning`, process polling as fallback | Reliable for direct child processes |
| Achievements | Steam Web API | Not supported |

Games from Epic, GOG and other launchers are registered as manual games. Some may only start through their official client (login or DRM); if launching the `.exe` directly fails, the manual launch configuration may need an alternative launch method. Validate this in Phase 4 with real games.

---

## 9. Persistence

`DATA_BASE_CONTEXT.md` v0.2 is the authoritative description of the schema. This section summarizes it.

### Rules to preserve (from `DATA_BASE_CONTEXT.md`)

- `GAMES.playtime` is in minutes, `NOT NULL DEFAULT 0`, `CHECK (playtime >= 0)`.
- `GAMES.origin` identifies the source (a key in `ORIGINS`), not installation state.
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
| `origin` | `TEXT` key with a foreign key to `ORIGINS(key)` (D-05) |

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

A failed scan must not mark every game from that source as uninstalled. The planning part is implemented by the Phase 5 discovery contract (§8); the refresh action, progress and the review step arrive with the Steam adapter in Phase 6.

### Library view (Phase 5)

Search, filters and sorting are pure functions in `src/shared/library-view.ts`, applied in the renderer to the summaries it already holds (`games:list` returns every game with its `hidden` flag). The view state lives in an app-level React context: it survives navigation and resets on restart, so no preference is persisted (the open question about where to persist preferences stays open). Home uses the fixed `homeGames` rule: every installed, non-hidden game (no limit), most recent session first. Manual flags are written through `games:set-flags` (validated `{ hidden?, beated? }`, every origin).

### Metadata and genres

For Steam, use `appdetails`: check the success flag, validate optional fields, normalize, then persist. Never overwrite `hidden` or `beated`, and never replace valid values with empty strings after a network or format error. Genre names are normalized to avoid duplicates. Metadata sync is separate from installation detection and session measurement. Fetched only on discovery or when adding a game, with retry after failures (§3.14, D-16).

### Launch and session

1. Validate the launch configuration (§7).
2. Invoke the adapter's launch. For Steam, open `steam://rungameid/<appid>` built in the main process (D-17) and confirm the start by observing `AppRunning`.
3. Insert a `running` session and observe the process where feasible: for Steam games through the manifest `AppRunning` flag (D-12), for manual games through the launched process.
4. On exit, finalize the session and update `playtime` / `time_last_played` in one transaction (D-08), then trigger the per-game achievements sync if applicable.
5. On launch failure, show an actionable error with a retry option.

On startup, reconcile sessions left `running` by a previous crash: mark them `interrupted`, close them at their last heartbeat and add their time (D-08).

**Manual-game process observation (Phase 4, measured).** The launcher spawns the executable directly (no shell, arguments as an array) and observes **only that process**: the session starts on the OS "spawn" event, a heartbeat updates `last_seen_at` every 30 s, and the session completes when that process exits. Known limits:

- Executables that only start another process and exit (launcher stubs, some Epic/GOG games that require their client, emulator front-ends) end the session immediately, so their time is not captured. Detecting the real game process (e.g. by watching processes under the game folder) is not implemented.
- If the launcher itself is closed or crashes while a game runs, the game keeps running; on the next start the session is closed at its last heartbeat (at most ~30 s lost, verified by force-killing the launcher).
- Games that the user starts outside the launcher are not observed.
- `.url` shortcuts only ask a store launcher to start the game; no process is returned, so their playtime is not measured. Yuzu games are observed through the `yuzu.exe` process the launcher starts.
- Verified end to end in Phase 4 with a test executable (a 65 s session added 1 minute; a forced kill was recovered as `interrupted` at the last heartbeat). Real Epic/GOG games are validated by the owner and listed in the ROADMAP.

---

## 12. UI architecture and performance

- Screens: Home (continue playing, recent games, shortcut to the library), Library, Achievements, Game Details, Settings. Navigation is hybrid: compact global navigation plus contextual navigation where needed.
- One focus manager owns focus. Focus must never disappear when a list updates, a filter changes, or images load; dialogs move focus in and return it on close; the app must never trap focus.
- Every screen defines default, focus, unavailable, empty, loading and error states (`DESIGN_SYSTEM.md` §11).
- The on-screen keyboard is a first-class component, used by search and any text field.
- Images: load progressively, request appropriate sizes, cache on disk, and avoid loading every high-resolution cover at once. Use placeholders for missing art. Sources and cache policy: §3.13 (D-15).
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
- **Integration:** adapters against fixtures (sample `libraryfolders.vdf`, `appmanifest_*.acf`, `appdetails` and achievement responses) and simulated failures (timeouts, malformed JSON, privacy-restricted profiles). For Steam local discovery, include fixtures for: multiple libraries, a missing `libraryfolders.vdf`, an unreadable library (drive disconnected), a game being downloaded or updated, a running game, corrupt/missing files, and non-game manifests; assert that none of the failure cases ever writes `installed = 0`.
- **Application:** library refresh with partial failure, launch failure, per-game sync after close, manual full sync, idempotent repeated sync, crash recovery of running sessions.
- **UI / manual on Windows:** controller focus, disconnect/reconnect, window focus loss, multiple Steam libraries, intermediary launchers, 1920×1080, 1280×720 and 2560×1440.

Routine tests must not call live Steam endpoints; keep a separate real-world verification checklist.

---

## 15. Known risks and limitations

- Steam discovery and launch methods can change.
- Some manually added games (e.g. from Epic) may require their official client to start; direct `.exe` launch may fail for them.
- Process observation can miss child processes and intermediary launchers (see "Manual-game process observation" in §11); session time is best-effort for Steam games.
- Steam `StateFlags` are not an official, documented contract and could change; fixtures and a graceful "unknown" state limit the damage.
- Electron's size and memory use are unmeasured (D-01).
- Gamepad behavior varies by controller and by window focus; needs hardware validation.
- Steam API responses, privacy settings and rate limits may limit achievement data; validate current behavior before implementing.
- Artwork and metadata sources may involve API keys and terms of use (D-15).

---

## 16. Implementation order

Follows `ROADMAP.md`. Do not generate the application skeleton until D-01, D-02, D-03 and D-14 are **Accepted** and recorded here. Phase 1 is now unblocked. The first coding task should be **Phase 1 — Project skeleton only**; do not ask for the whole roadmap in one prompt.

### Definition of done

A change is ready when it meets its acceptance criteria, respects layer boundaries and security rules, includes tests proportional to risk, handles partial failures, adds no unjustified dependencies, updates affected docs (including this file when a decision changes), and states its manual validation steps and known limitations.

---

## 17. Change log

| Date | Version | Change |
| --- | --- | --- |
| 2026-10-25 | 0.1 | Initial draft with unresolved decisions |
| 2026-11-01 | 0.2 | Aligned with updated PRD, database context, design system and roadmap; added decision log with recommendations, cross-document inconsistencies, Electron process model, SQLite adaptation, achievements architecture, session model proposal |
| 2026-11-01 | 0.3 | Dropped Epic/GOG automatic integration (D-17 removed); Epic games are added manually with `origin = manual`; roadmap phases renumbered |
| 2026-11-01 | 0.4 | Owner accepted D-01, D-02, D-04–D-10. Accepted D-03 (SQL migrations + `better-sqlite3`), D-11 (polled Gamepad API), D-12 (Steam manifest-based discovery, installation and running state, with safeguards). Added D-17 (Steam launch, open) |
| 2026-11-01 | 0.5 | Proposed D-15: SteamGridDB + Steam `appdetails` + local file picker for artwork; Google Images not adopted; proposed `GAME_ARTWORK` table and cache rules |
| 2026-11-01 | 0.6 | Accepted D-16 (fetch `appdetails` only on discovery/add, retry failures; proposed `metadata_fetched_at`) and D-17 (`steam://rungameid/<appid>` with start confirmed via `AppRunning`) |
| 2026-11-01 | 0.7 | Accepted D-14 (npm, electron-vite, Vitest, ESLint + Prettier, strict TypeScript); documented the `better-sqlite3` Node/Electron ABI rule and the `node:sqlite` check for the Phase 1 spike. Phase 1 unblocked |
| 2026-11-01 | 0.8 | Accepted D-15 (artwork). Aligned `README.md`, `PRODUCT.md`, `DATA_BASE_CONTEXT.md`, `DESIGN_SYSTEM.md` and `ROADMAP.md` with all accepted decisions. Recorded the open Home cover type |
| 2026-11-01 | 0.9 | Added a fifth art type: portrait cover 600×900 for the Home screen. Renamed `cover` to `cover_square`; added `cover_portrait` |
| 2026-11-02 | 0.15 | Phase 4 owner changes: emulators become a separate feature (`EMULATORS`, Yuzu only, ROM-only games, `-f -g "<rom>"`), replacing emulator defaults on origins; `.url` shortcuts accepted with a scheme allowlist and no playtime measurement |
| 2026-11-02 | 0.14 | Phase 4 decisions: emulator defaults on origins (pre-fill only), `playtime_offset` for user-entered playtime, manual install state from the executable, own file browser with native-dialog fallback, local artwork import rules, new input actions (X, Y, LT, RT) and text-entry mode |
| 2026-11-02 | 0.13 | Phase 3 decisions: own focus manager; `previousSection`/`nextSection` actions (LB/RB); `equon-art://` protocol for cached artwork; React Testing Library + jsdom; separate dev user-data folder and seed script |
| 2026-11-02 | 0.12 | D-08: Steam playtime and last played synced once per launcher start (GetOwnedGames) and overwritten; sessions add on top until the next start (`steam_playtime_baseline`, `steam_synced_at`) |
| 2026-11-02 | 0.11 | Phase 2 decisions: D-05 changed to an extensible `ORIGINS` table (built-in `steam`, `manual`, `yuzu`, `ps2`; user-created origins); D-08 interrupted sessions add time up to their last heartbeat (`last_seen_at`) |
| 2026-11-01 | 0.10 | Phase 1: recorded spike results (§3.1); better-sqlite3 13 needs no rebuild (N-API prebuilds), rebuild scripts dropped (§3.3, §3.15); electron-vite 6 confirmed maintained (release 2026-10-14) |
