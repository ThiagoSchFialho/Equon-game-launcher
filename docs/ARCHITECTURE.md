# Equon Game Launcher — Architecture

**Version:** 0.33
**Status:** Current — all roadmap phases complete
**Last updated:** 2026-11-04
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
| D-13 | Windows packaging / installer | Accepted | NSIS through electron-builder: per user, no administrator, not signed, no automatic updates (§3.16) |
| D-14 | Package manager, build tool, test framework, lint/format | Accepted | npm; electron-vite; Vitest; ESLint + Prettier; TypeScript `strict` (§3.15) |
| D-15 | Artwork sources and cache policy | Accepted | SteamGridDB (API key) + Steam `appdetails`, plus IGDB (D-18, first choice for logo and background, fallback for the portrait cover); local file picker as fallback; Google Images not adopted (§3.13) |
| D-18 | IGDB: filling in manual games and artwork for new Steam games | Accepted | Own Twitch app credentials per user, encrypted; games from a ROM folder are filled only under the very same name, unconfirmed; see §3.17 |
| D-19 | Editing the art of a game by hand | Accepted | "Editar artes" screen for any game; removed art stays removed; see §3.18 |
| D-20 | Settings › Sistema and where preferences live | Accepted | Columns in `USERS`; starting with Windows is read from Windows; see §3.19 |
| D-21 | System menu | Accepted | Xbox button or footer icon, on any screen: fullscreen, settings, shutdown, quit; see §3.20 |
| D-22 | Image over the screen while a game opens | Accepted | Own topmost window; the game starts once covered; leaves 2 s after a new process takes the foreground; see §3.21 |
| D-23 | Installing and uninstalling Steam games | Accepted | Steam's own windows, through `steam://install` and `steam://uninstall`, built in main; see §3.22 |
| D-25 | Game art behind the Home screen | Accepted | Settings › Aparência: the focused game's launch image, blurred and darkened by the user's levels; `USERS.home_art_*`; see §3.24 |
| D-26 | Removing Steam games, with exceptions | Accepted | "Remover jogo" for Steam games, from Equon only; "Remover e criar exceção" keeps it out of every sync (`STEAM_IGNORED`); see §3.25 |
| D-27 | Home covers: size, spacing and position | Accepted | Settings › Aparência › "Capas da home": two levels 1–100 and Em cima / Centro / Embaixo (portrait covers in Centro, a square-cover shelf on either edge); `USERS.home_cover_*`; see §3.26 |
| D-28 | A on a Home cover can start the game | Accepted | Settings › Sistema › "Ignorar tela do jogo na home", off by default; Home only; a failed launch opens the game page; `USERS.home_direct_launch`; see §3.27 |
| D-29 | "Em cima" panel: play stats and latest achievements | Accepted | Under the "Em cima" shelf: logo, play stats, the 4 latest achievements; down enters it, A opens the game achievements; icons download when the user comes down; size 18 and spacing 4 fixed in "Em cima"; see §3.28 |
| D-30 | "Imagem da home", a seventh art kind | Accepted | `home` 16:9, only chosen by the user in "Editar artes"; the Home background uses it, then the launch image, then the background; migration 0022; see §3.29 |
| D-24 | Interface sounds | Accepted | Sounds on moving, confirming, going back and opening modals; on by default, `USERS.ui_sounds`; silent while a game runs; see §3.23 |
| D-16 | Refresh frequency for `appdetails` metadata | Accepted | Fetched only when a game is discovered/added; failed fetches are retried (§3.14) |
| D-17 | Steam launch mechanism | Accepted | `steam://rungameid/<appid>`, built in the main process (§3.12) |

Decisions that **block Phase 1** (project skeleton): D-01, D-02, D-03, D-14.
Decisions that **block Phase 2** (database): D-02, D-03, D-05, D-06, D-08, D-09, D-10.
Decisions that **block Phase 4** (manual-game slice): D-07, D-08.
Decisions that **block Phase 6** (Steam library and metadata): D-12, D-16, D-17 (all accepted).

**Phase 1 is unblocked:** D-01, D-02, D-03 and D-14 are all accepted. D-13 (installer) was decided in Phase 8. The Home cover question is settled: a separate `cover_portrait` art type (§3.13).

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
- **Emulators (decided in Phase 4):** emulators are a separate feature, not origin settings. An `EMULATORS` table stores the executable the user configured per supported emulator (only **Yuzu** for now; Settings → "Emuladores"). A Yuzu game (origin `yuzu`) stores only its ROM path; at launch main builds `yuzu.exe -f -g "<rom>"` as an argument array, so changing `yuzu.exe` applies to every Yuzu game. The built-in `manual` origin is displayed as "Jogo Local" (migration `0002`). Details: `DATA_BASE_CONTEXT.md` §3.7 and §3.12.
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
| AppRunning | 64 | not set by Steam in practice (Phase 6 measurement); not used |
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
- **Find Steam on Windows properly.** Read the install path from the registry value `SteamPath` under `HKCU\Software\Valve\Steam` (with `reg.exe`, no shell, fixed arguments) and fall back to the default install folder. There is **no user override** (owner decision, Phase 6): `libraryfolders.vdf` already lists every library on every drive, so only the main install has to be found. Remove the macOS/Linux branches. If Steam is not found, report it as a warning and change no data.
- **A failed read is not an uninstall.** The prototype swallows read errors and then marks every game missing from the scan as not installed. That breaks the project rule. Instead, each library returns `ok` or `unreadable` with the error, and the adapter returns warnings. When writing results:
  - games found in the scan → `installed = 1`;
  - games absent from the scan → `installed = 0` **only if** `libraryfolders.vdf` and every listed library were read successfully; otherwise → `installed = NULL` (unknown), for example when a drive holding a library is disconnected;
  - if Steam itself was not found, update nothing.
- **Only installation state is persisted.** `GAMES.installed` stays tri-state (D-06). Transient states (running, installing, updating, paused, update required, unhealthy) are read live and shown in the UI; they are not stored.
- **Filter non-games.** Manifests also exist for tools such as Steamworks Common Redistributables. Ignore known tool App IDs and/or confirm the `type` from `appdetails`; validate which approach works.
- **Return a list of running apps** instead of the first match, even though normally only one runs.
- **Parsing.** The regex approach is acceptable for the few fields needed, but names can contain escaped characters and formats can vary. Cover this with fixtures, or use a small VDF parser if the regexes prove fragile.
- **Scope.** This only finds games that have a manifest (installed or being installed). Owned-but-not-installed games come from the `GetOwnedGames` endpoint (requires the key; `DATA_BASE_CONTEXT.md` §3.11).

**Running state and sessions (decided in Phase 6):** measured on a real install, the manifest never sets `AppRunning`; Steam reports the running game in the registry instead (`HKCU\Software\Valve\Steam\RunningAppID`, plus `Apps\<appid>\Running`), switching within a poll interval when the game opens and closes. The launcher reads `RunningAppID` every 2 s with `reg.exe` (no shell). A session starts when the value becomes the App ID of a library game, for games started by the launcher or by Steam itself, and ends when it returns to 0 or changes (`SteamSessions`, same heartbeat and interrupted-session recovery as manual games). Best-effort: if Steam crashes or is killed, the value can stay stale until Steam or the launcher restarts. The manifest is still used for the install state and the live states (updating, paused, update required, unhealthy).

**Launch (D-17, Accepted):** launch Steam games with the URL protocol `steam://rungameid/<appid>`.

- The URL is built in the main process from a validated numeric App ID taken from the database, never from a string supplied by the renderer. It is opened through Electron's external-URL mechanism, restricted to this exact pattern (see §7).
- Opening the URL only asks Steam to start the game; it does not prove the game started. Treat the launch as successful when `RunningAppID` shows the game (D-12) within a timeout (90 s for now; to be refined by measurement). If it is not, show an actionable error with a retry option. The timeout is set by measurement, not guessed.
- Offer **Play** only when `installed = 1`. For `NULL` (unknown), warn instead of launching blindly. If the game is updating or installing, show that state rather than launching.
- If Steam is not running, the protocol is expected to start the client; validate this behavior and its delay on a real install.
- A session starts when the registry shows the game running, not when the URL is opened.

### 3.13 D-15 — Artwork sources and cache (Accepted)

Each game needs five images: a **square cover** (Library), a **portrait cover** (Home, shown 2:3), a **logo**, a **1920×1080 image**, and a **header image**. The two covers are independent assets; neither is cropped from the other.

| Asset | Steam games | Manual games |
| --- | --- | --- |
| Square cover (`cover_square`) | SteamGridDB grids, filtered to square dimensions, looked up by Steam App ID | SteamGridDB name search; the user confirms the match. Otherwise a local file |
| Portrait cover (`cover_portrait`, 600×900) | SteamGridDB grids, filtered to 600×900, looked up by Steam App ID. `appdetails` has no vertical cover; Steam's own CDN asset for it is undocumented and must not be relied on. IGDB when SteamGridDB has none (§3.17) | Same as the square cover |
| Logo | IGDB first when configured (§3.17). Then SteamGridDB logos | Same as cover |
| 1920×1080 | IGDB first when configured (§3.17). Then `background_raw` from `appdetails` (owner decision, Phase 6c; measured 1438×810, ≈16:9). When the store only has a generated, blurred background (`/images/storepagebackground/`), the first screenshot (`screenshots[0].path_full`, 1920×1080) is used instead (owner decision) | A local file chosen by the user. SteamGridDB heroes are wide banners, not 16:9 (verify dimensions), so use them only as a fallback with `cover` fit |
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
- Persistence: table `GAME_ARTWORK`, with kinds `cover_square`, `cover_portrait`, `logo`, `background`, `header` and `launch` (only chosen by the user, §3.21); defined in `DATA_BASE_CONTEXT.md` §3.9.
- Artwork the user selected is never overwritten by an automatic fetch (same principle as `hidden` / `beated`). Refresh only on an explicit action or when art is missing.
- A failed fetch keeps the existing cached art. Validate every download (content type, maximum size, decoded dimensions) before saving.
- Do not bundle or redistribute fetched images; the cache is personal and local.

**Implemented in Phase 6c:** a main-process queue (`src/main/artwork/artwork-fetcher.ts`) runs after the startup scan, the metadata queue and every "Atualizar biblioteca", and when a SteamGridDB key is saved. It fills only missing kinds: `header` and `background` from `appdetails` (`filters=basic,background`), and `cover_square` (512×512/1024×1024), `cover_portrait` (600×900) and `logo` from SteamGridDB by App ID, taking the highest-scored static, non-NSFW, non-humor image (owner decision). API calls are spaced 1.5 s apart. Downloads are allowed only over https from `*.steamstatic.com` and `cdn2.steamgriddb.com` (redirects included), capped at 20 MB, then validated like local files; WebP, which Electron's `nativeImage` cannot decode, is checked through its VP8/VP8L/VP8X header instead of a full decode (displayed by the sandboxed renderer). Manual games: "Buscar artes no SteamGridDB" in the game options menu searches by title (`/search/autocomplete`), the user picks the game, and its covers, logo and header (460×215/920×430 grid) are stored as user-selected art; the background stays a local file.

**Owner decisions of Phase 8:** "Buscar artes no SteamGridDB" (replaced by "Editar artes" in §3.18) also works for Steam games: the same search, replacing covers, logo and header as user-selected art, which no sync overwrites. A game the queue got answers for is not tried again at startup, even with no art to show (`GAMES.artwork_checked_at`); "Atualizar biblioteca" and saving a SteamGridDB key are explicit and try again. The image address carries a version (`?v=<last fetched_at of the game>`), since Chromium would otherwise keep showing the old file until a restart. A network failure stops the metadata and artwork queues, ending the indicator, and marks nothing, so the next start tries again. Only a failed connection counts as no network: a server that answers but cannot serve (429, 5xx; the store limits about 200 requests per 5 minutes) makes the queue wait 1 minute and go on, and 5 such answers in a row end the run, with those games left to try at the next start.

**Decided after measuring (Phase 8a, owner decision):** no automatic cache eviction, and artwork is stored as downloaded, with no size limit or variants; see §12. **Open sub-decisions:** the fallback look when a game has no 1920×1080 image; Picking files (decided in Phase 4): an **own controller-friendly file browser**. Main lists drives, a few known folders, folder names and only files with the allowed extensions (`.exe`/`.url` for game executables, `.exe` for emulators, Yuzu ROM formats for ROMs, `.png`/`.jpg`/`.jpeg`/`.webp` for images); it never returns file contents, and the chosen path is validated again in main when saving. A "Usar janela do Windows" button opens the native dialog for mouse users. Inside a folder, the list starts with a "..." entry that goes up one folder, like Back (owner decision, 2026-11-09); "Usar esta pasta" is in the accent color and "Usar janela do Windows" sits on the right. Local artwork import: main reads the file (max 20 MB), checks the real type by its magic bytes, decodes it to get the dimensions, checks the kind's proportion (background 16:9, ±5%), copies it into the cache and saves it with `user_selected = 1`.

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

Phase 6b: requested in Portuguese (`l=brazilian`); only `genres`, `developers`, `short_description`, `release_date` (Portuguese "20/fev./2024" parsed to YYYY-MM-DD) and the Brazilian rating `ratings.dejus.rating` are stored (L/10/12/14/16/18; an age DEJUS does not have, such as Steam's generated "6", goes up to the nearest rating, never down; anything else is "pendente") (owner decisions), plus `header_image` as the `header` artwork in 6c. Steam Web API calls (`GetOwnedGames/v1`, `GetPlayerSummaries/v2` for "Testar conexão") and the SteamGridDB key check go through an injected HTTP port in `src/integrations`, validated with zod; keys are decrypted only in main and request URLs are never logged.

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
- Packaging the module: `*.node` files are unpacked from the asar, and only the `win32-x64` prebuild ships (verified in Phase 8, D-13).

---

### 3.16 D-13 — Windows packaging (Accepted, Phase 8c)

**Owner decisions:** an NSIS installer built by electron-builder, installed per user with no administrator rights. Not the portable version, which would extract itself on every launch. No code signing for now: the certificate costs money, the use is personal, and the price is a Windows SmartScreen warning at install time and antivirus programs (Avast, measured) holding each new unsigned executable for a scan, so the first launch after a new build can take a while. No automatic updates: a new version is the new installer run over the old one.

**Data folder.** Installed runs always use `%APPDATA%\equon-game-launcher`, set in code: by default Electron would derive it from `productName` (`Equon`), so renaming the product would look like losing the library. Unpackaged runs keep `equon-game-launcher-dev`. Installing, updating and uninstalling never touch the data folder. `--user-data-dir` overrides the folder, which is how the packaged app is tested without touching the real one.

**Verified on the packaged app with a throwaway data folder:** the native module loads from the unpacked folder; a new database reaches the latest schema; the local scan finds the installed games; keys are encrypted and removed; with no keys it reports the reason and keeps working; artwork comes through the custom protocol; the real data folder is not touched.

**Security review (Phase 8d).** No secret in the repository or its history; all 35 IPC channels are validated; no process goes through a shell; `shell.openExternal` only takes allowlisted URLs; no log carries a URL or a key. Changes: installed runs replace the default Electron menu, which offered DevTools, reload, zoom and close (`src/main/app-menu.ts`; F11 and the text editing shortcuts stay, and the menu bar never shows); Electron fuses turn off running as Node and the Node inspector options, and validate the package; image downloads stop at the size limit even if the server hides the size. **Known and accepted:** `npm audit` reports 13 moderate issues, all in lint and packaging tools that do not ship, and production has none; the offered fix would downgrade those tools. `--remote-debugging-port` still works on the installed app: it only listens locally and is how the package is tested, and a local program with the same rights could already read the same data. The installed app keeps no log file. `style-src` keeps `unsafe-inline` because the dev server needs it, and nothing renders untrusted HTML.

**Preferences:** the Library view and the sorts reset at every start by owner decision; keys and paths already have their own storage. Settings › Sistema has the only stored preference so far (D-20, §3.19).

### 3.17 D-18 — IGDB (Accepted, after Phase 8)

**Owner decisions:** the add form asks only for the title, the executable, the playtime and the arguments, and the game is a "Jogo Local". On saving, IGDB always shows its results for the user to confirm the game, which fills in the rest; metadata, origin and images are typed or chosen only when editing. The executable field also takes a ROM when an emulator is configured, and the game then belongs to that emulator. If IGDB cannot answer (no credentials, no network, an error), the game is saved with what was typed and a notice gives the reason; with no results the user can search another name or save without IGDB. Descriptions come in English and stay editable, since IGDB localizes only names and covers. Genres are stored translated by a table of ours. IGDB gives the logo and the background; the portrait cover, the square cover and the header come from SteamGridDB when a key is set, with IGDB as the fallback for the portrait cover. Editing an existing game only fills empty fields and never replaces chosen artwork.

**Credentials.** IGDB is free for non-commercial use under the Twitch Developer Service Agreement, with each user's own Twitch app (Client ID and Client Secret; the Twitch account needs two-factor authentication). Both are encrypted like the other keys. The access token stays in memory, and the secret goes in the token request's body, never in a URL, although the IGDB docs show it in the query string. Limit: 4 requests per second, 8 open at a time.

**Measured with real data (2026-11-05, 8 games).** Search returns obscure entries first ("Fortnite" brought the Chinese version, "Super Mario Odyssey" a fan game), so results go exact name first, then by rating count, with the developer shown to tell apart equal names; add-ons, mods and editions are left out. Covers are all 3:4, so portrait covers accept 2:3 to 3:4. By owner decision the Home card is 2:3 and stretches the whole art to fit, with no cropping or bars, which slightly narrows 3:4 art from IGDB. Artworks come in any shape, so the background is the widest 16:9 image of at least 1280 px, official art first, then screenshots. Logos have their own endpoint, exist for about half of the games and keep transparency only as PNG. The rating is the ClassInd one, read through `organization` and `rating_category`; the old `category` and `rating` fields are deprecated. SteamGridDB fills the square cover, the header and what else is missing only under the very same name, since nobody confirms that match.

**Steam games (owner decision, 2026-11-05).** With credentials set, IGDB is the first source of a Steam game's logo and background; the header stays with Steam and the square cover with SteamGridDB, since IGDB has neither. The portrait cover comes from SteamGridDB, where it is 2:3, and from IGDB only when SteamGridDB has none or there is no key (owner decision, 2026-11-06, after trying IGDB first with 3:4 cards). Manual games filled from IGDB follow the same order. Whatever IGDB does not have, or an image that fails validation, falls back to the previous source of that kind. The game is looked up by App ID in `external_games`, never by name. Only new games and missing art: art a game already has is never replaced, and answered games wait for "Atualizar biblioteca" as usual. Metadata still comes from `appdetails`. IGDB failing does not cost a game its other sources: with no network the queue stops; any other failure leaves the game to try again. Saving IGDB credentials does not start a retry; the button does.

**Games from an emulator's ROM folder (owner decision, 2026-11-07): an exception to confirming the game.** They are added with no one there to confirm (`DATA_BASE_CONTEXT.md` §3.12), so `src/main/emulators/rom-library.ts` searches IGDB by the name taken from the file and takes a result only under the very same name, compared without case, accents, ™/®/© and punctuation (a file name cannot have a colon). That result fills the official name, the details, the genres and the art, like a confirmed game, except that only the background comes from IGDB first: the logo joins the covers and the header on SteamGridDB, with IGDB's logo and portrait cover as the fallback (owner decision, after IGDB logos on the first ROMs); anything else leaves the game with its file's name, for "Editar jogo" and "Editar artes". One game at a time, after the folder was read, so a failure costs only that game.

**"Buscar artes no IGDB" (owner decision, 2026-11-05; replaced by "Editar artes", §3.18).** In the options menu of any game, next to the SteamGridDB search: search by title (without ™, ® and ©), the user confirms the game, and its portrait cover, logo and background replace the current ones and count as chosen by the user, like the SteamGridDB search. What IGDB does not have stays as it is. Both art searches close by themselves when the download ends; only failures stay on screen.

**Measured (2026-11-05, 50 of the owner's 258 Steam games).** All 50 found by App ID, each with one IGDB game; all with a 3:4 cover; 49 with a 16:9 background of at least 1280 px (27 official art, 22 screenshots); 24 with a logo, so the SteamGridDB fallback matters for logos.

### 3.18 D-19 — "Editar artes" (Accepted, after Phase 8)

**Owner decisions (2026-11-05):** a screen for any game, from the options menu, with the portrait cover, the square cover, the logo and the background; the header keeps coming from its sources. It replaces "Buscar artes no SteamGridDB", "Buscar artes no IGDB" and the image field of the edit form. Removed art stays removed until the user chooses another image.

**Sources per kind.** IGDB: portrait cover, logo and background (it has no square covers). SteamGridDB: both covers and the logo (its banners are not 16:9). A local file and removal: all four. A Steam game goes straight to its App ID on both sources, falling back to a search when that finds nothing; any other game always confirms the game by name.

**Nothing changes until Salvar.** Chosen images wait in main's memory (`src/main/artwork/artwork-editor.ts`) and are previewed through `equon-art://draft/<kind>`, so Cancelar or a crash leaves nothing behind. Salvar writes the files, then saves and removes in one transaction, and deletes the removed files only after the commit. Everything is validated like any other art (type, size, decoded dimensions, proportion).

**SteamGridDB gallery.** Up to 40 static images, best voted first, without adult or joke entries. Thumbnails come through `equon-art://grid/<assetId>`: main downloads them on demand from the image allowlist, checks their real type and serves them from memory, since the renderer has no network access. The renderer names an asset id main listed and never sends a URL.

**Steam gallery (owner decision, 2026-11-06).** For the background of a Steam game: the store's own background first, called "Fundo da loja", then the screenshots, up to 40 images, as `equon-art://steam/<choiceId>` thumbnails with the same rules as the SteamGridDB gallery. A generated, blurred store background is not offered. Opening the gallery asks `appdetails` once, on the user's request, and reads only artwork fields, so it is the one exception to "only on discovery/add" (D-16) and never changes the game's metadata or `metadata_fetched_at`. Only images that fit are listed (owner decision). Steam does not report sizes, so main measures the thumbnails, a few at a time, and keeps them to show in the gallery. Thumbnails keep the proportion of the image (measured on 2026-11-06 on the owner's 25 oldest games: 71 of 145 screenshots were not 16:9, such as 1024×768 with a 451×338 thumbnail; about 71 KB each). The download is still validated, so an image that gets through this way is refused, and the gallery stays open and says why. Choice ids are never reused while the app runs, not even for the same game: the browser may keep an image by its address, so one address must never mean two images (owner's report: the gallery of a game opened showing another game's images).

**Imagem de abertura (owner decision, 2026-11-07).** A fifth panel, after the background, for the image shown while the game opens (`launch`, §3.21). By default it is the background: with no image of its own, the panel previews the background (also one chosen or removed on the same visit) and says "Usando a imagem de fundo". Its sources are the background's: the same IGDB image, the Steam gallery and a local file, all 16:9. Removing it deletes only the launch image, so the game goes back to opening over its background. Nothing downloads it automatically.

**Removed art** lives in `GAME_ARTWORK_REMOVED` (`DATA_BASE_CONTEXT.md` §3.9.1). `ArtworkRepository.save` refuses automatic art for those kinds and a user choice clears the mark; the queue and the IGDB fill treat them as present, so nothing is downloaded for them.

### 3.19 D-20 — Settings › Sistema (Accepted, after Phase 8)

**Owner decisions (2026-11-06):** a "Sistema" tab with two checkboxes, "Iniciar em tela cheia" and "Iniciar com o sistema", both off by default and saved as soon as they change.

**Where preferences live.** Columns in the single `USERS` row, one per preference. A settings table for one value would be more than this needs. This closes the open question in `DATA_BASE_CONTEXT.md` §7.2.

**Iniciar em tela cheia** is `USERS.start_fullscreen`, read once when the window is created, so it takes effect the next time the launcher opens. F11 keeps working at any time and goes back to the 1280×720 window.

**Iniciar com o sistema** is the Windows startup entry, through `app.setLoginItemSettings`. It is not stored: `executableWillLaunchAtLogin` is the only source, so an entry turned off in the Task Manager shows as unchecked, and checking the box turns it back on. After a change main reads the state again and reports an error if Windows did not take it. Unpackaged runs refuse it, since they would register the bare Electron binary. The uninstaller does not remove the entry; Windows ignores an entry whose program is gone.

**At login** the network may not be ready. The Steam sync of that start then fails and changes nothing, as any failed sync does (`DATA_BASE_CONTEXT.md` §3.11), and runs again the next time the launcher opens.

### 3.20 D-21 — System menu (Accepted, after Phase 8)

**Owner decisions (2026-11-06):** an Xbox icon at the left of the footer; the Xbox button opens a menu above it with, in this order, the fullscreen toggle, Configurações (the gear next to the clock is gone), "Desligar sistema" in red and "Sair". The last two ask first.

**The Xbox button reaches the app.** Older Chromium sources say XInput does not report it, so this was measured before building (2026-11-06, the owner's controller, "Xbox 360 Controller (XInput STANDARD GAMEPAD)"): it arrives as button 16 of the Gamepad API, every press, and the window kept the focus. Windows can still open the Game Bar with this button, depending on its settings, and the app cannot prevent that. Gamepad input is ignored while the window has no focus, as for every button, so pressing it during a game does not open the menu.

**Above everything.** `App` handles the `system` action before the focus manager, since a dialog would stop it, so the menu also opens over a dialog. The footer icon is for the mouse and stays out of the direction focus path; the footer is above dialog backdrops, so it stays visible and clickable.

**Unsaved work.** Configurações is unavailable on the game form and "Editar artes", whose unsaved state would be lost by changing screens.

**Security.** The renderer only asks for "shutdown", with no arguments. Main runs one fixed program, `%SystemRoot%\System32\shutdown.exe /s /t 0`, with `execFile` and no shell (`src/main/system/system-control.ts`). A delay of 0 does not force programs to close, so Windows may still ask about unsaved work; a higher delay would imply `/f`.

**Without the focus (owner's report, 2026-11-07).** Opened with Windows, the window could appear without the focus, and the controller then did nothing until a mouse click. The window now asks for the focus when it appears, and until the launcher is first used (any action, key or click), a controller press without the focus brings it to the front. That press does nothing else, works once, has no time limit (owner decision: the controller may only be picked up much later) and is refused while a game is running. The cost: a press in a game opened outside the launcher, before the launcher was used, takes the user out of that game once. `BrowserWindow.focus()` did take the focus back from another process (measured on 2026-11-07, not at login itself). Why the Xbox button alone worked in that state was not explained. The owner confirmed the fix by starting the PC with the controller (2026-11-07). Not tested, by owner decision since it is unlikely: a game opened outside the launcher before it was used. `document.hasFocus()` and the real Windows foreground can disagree (measured with throwaway windows), so in that case the launcher might keep reacting to the controller behind the game.

**A game left open.** Closing the launcher does not close the game. The session is closed at its last heartbeat on the next start (`DATA_BASE_CONTEXT.md` §3.8), so the confirmation warns about it.

### 3.21 D-22 — Image while a game opens (Accepted, after Phase 8)

**Owner decisions (2026-11-07):** on "Jogar", the game's background fades in over the whole monitor, and only then the game starts. When the game opens, the image waits 3 s and fades out. It is in front of everything. It always leaves after 60 s; Back (B) takes it away without closing a game already started; without a background it shows the logo, and without a logo the title; fades take about 0.6 s, none with reduced motion. Later the same day, the game's own "Imagem de abertura" (`launch`, §3.18) comes first, when it has one: launch image, then background, then logo, then title. The wait after the game opens also went from 3 s to 1 s, then to 2 s (owner decisions, 2026-11-07). Then "Carregando" with animated dots in the bottom right corner, over any of them (owner decision, 2026-11-07). It fades in with the window but goes at once right before the fade out (2 s after the game window appears, or on B, 60 s or a failed launch), so only the image fades: main inserts one fixed CSS rule into the cover page (`webContents.insertCSS`, no script, nothing from outside), and fades out anyway after 200 ms if the page does not answer.

**When has the game opened?** What the launcher already knew was not enough: Steam reports a game before its window exists, a process starts long before it has one, and a `.url` shortcut has no process at all. So while the image is up, `src/main/launch-cover/foreground.ts` keeps a small PowerShell process asking Windows which window is in the foreground. It runs one fixed script, by absolute path, with no shell and nothing from outside in it, and it only reads. The signal is the first foreground window that is **large**, at least half of the monitor each way, of a process **started after the launch**, leaving out the launcher, the Windows shell, the Steam client and the launchers of other stores. A window that grows also counts. Every condition came from measuring: an empty foreground (`Idle`) and programs already open, such as VS Code, took the foreground while covered, and games open a small window before their own (Fortnite an 800×450 anti-cheat window, Forza Horizon 6 a 311×151 one, Assassin's Creed IV the Ubisoft launcher, `upc`, at 714×454). The launcher names are a list and will not cover every store. If PowerShell cannot run, the image leaves by its time limit.

**The window** is a second `BrowserWindow`: frameless, topmost at the `screen-saver` level, on the launcher's monitor, sandboxed, with no preload. It cannot take the focus, so the launcher keeps it until the game takes it, which is what lets B reach the launcher. While it is up, the launcher ignores all input but Back, since nothing below can be seen. Windows keeps a window inside the work area, leaving the taskbar uncovered (measured: 1035 of 1080 px), so it needs `enableLargerThanScreen` and bounds set after showing. Its page is the renderer's `index.html` with a `#cover` address, which renders only `src/renderer/src/cover.ts`. A cover that cannot open never stops the game.

**Known limitation.** A small window that needs an answer, such as a launcher's login or a prerequisite installer, stays behind the image until the 60 s or B, since it no longer makes the image leave.

**Tested by the owner (2026-11-07), on a throwaway version:** Balatro, Fortnite, Forza Horizon 6 and Assassin's Creed IV opened as expected, with the image leaving early on the last three, which led to the size rule. The owner then confirmed the final version with the size rule. A prompt hidden behind the image did not come up in these tests.

### 3.22 D-23 — Installing and uninstalling Steam games (Accepted, after Phase 8)

**Owner decisions (2026-11-07):** on the page of a Steam game confirmed not installed (`installed = 0`), a blue "Instalar" takes the place of "Jogar". Installed Steam games have "Desinstalar" in the options. Both hand over to Steam normally, with the mouse for now.

**How.** There is no public API for this, so main opens `steam://install/<appid>` or `steam://uninstall/<appid>`, built from the validated App ID in the database (`src/main/steam/steam-install.ts`) and checked against an allowlist, and Steam shows its own windows. The renderer only names the game. Steam does not say whether the user confirmed: the existing local check of the library sees what changed and the page follows it. An unknown state (`NULL`) offers neither, and "Desinstalar" is not offered while the game is running. The launcher adds no confirmation of its own, since Steam asks.

**Not adopted.** Automating Steam's windows with simulated clicks, since a wrong click could confirm an uninstall and Steam may change those windows at any time; and SteamCMD, which would need the user's Steam password.

**Not measured yet:** whether Steam's window appears in front of the launcher in fullscreen, and what the page shows while a game downloads.

### 3.23 D-24 — Interface sounds (Accepted, after Phase 8)

**Owner decisions (2026-11-08):** sounds from the free "Cosy User Interface SFX" pack by Jacob (SampleKingdom), which allows commercial use (`design/sounds/CREDITS.md`, credited under Configurações › Sobre). Moving the focus plays `SFX_Item_Select`, confirming `SFX_Button_1`, going back `SFX_Back`, Jogar and Instalar `SFX_Button_2`, opening a modal (options, filters, sort, confirmations, keyboard, file browser) `SFX_Notification`, and opening the system menu `SFX_Dialogue_VO_Frank_004`. `SFX_Positive_Feedback` is not used yet. Changing section with LB/RB plays JDSherbert's swipe (owner decision, 2026-11-08), whose license requires credit and forbids redistribution: the file stays out of the public repo (`.gitignore`), the renderer finds it at build time through `import.meta.glob` under `assets/sounds/licensed/`, and a build without it plays the move sound instead. A "Sons da interface" checkbox in Configurações › Sistema, on by default (`USERS.ui_sounds`, migration 0016).

**Where they come from.** The six used files are copied into `src/renderer/src/assets/sounds/`, named by what they do (`design/` is not packaged). The focus manager already sees every user action, from the controller, the keyboard or the mouse, so it reports a cue for a move, a confirm, a back or a section change (`onCue`), and only for those: focus that moves by itself (a screen opening, focus coming back) stays silent. Buttons can ask for another confirm sound (`confirmSound: 'play'`). An item that moves the focus itself on a direction (the achievements columns of a game) gets the move sound too; one that changes a value instead (the date picker) stays silent. `DialogFrame` plays the modal sound when it opens and the system menu its own. Screen shortcuts are silent unless they ask: X changing the sort of Conquistas plays the confirm sound (owner decision).

**One press, one sound.** A press that opens a modal reports a confirm, then the modal opens a moment later: within 80 ms the stronger sound wins (system menu, modal, play, confirm or back, move) and the weaker one stops. A held direction restarts the move sound instead of stacking it. Volume 0.5.

**Silence.** Off in Settings, while a game runs, under the launch image (D-22) and while the window is in the background. The renderer reads the setting once and Settings updates it as it changes.

**Security.** The CSP gains `media-src 'self'`: audio only from the app itself.

### 3.24 D-25 — Game art behind the Home screen (Accepted, after Phase 8)

**Owner decisions (2026-11-08):** a new Settings tab, "Aparência", with "Mostrar arte do jogo como background" (off by default) and two levels the user sets: "Desfoque" (0 to 10, default 4) and "Escurecimento" (0% to 90% in steps of 10, default 60%). When on, the Home screen shows the focused game's launch image behind everything, blurred and darkened; a game with no launch image uses its background image, as the launch cover does (D-22), and one with neither shows the usual background.

**Where it lives.** Three `USERS` columns (`home_art_background`, `home_art_blur`, `home_art_dim`, migration 0017), each with a range `CHECK`; the IPC schema takes only what changed, within range and step. The renderer reads them once at start (`data/home-art.ts`) and Settings updates them as they change, shown at once and undone if saving fails.

**The levels** are a new focusable control (`components/LevelRow.tsx`): left and right change the value when they can, and at the end of the range they move the focus on as usual, so it is never trapped. Each step plays the move sound (D-24). The mouse uses − and +. Unavailable, with the reason readable, while the option is off.

**The image.** `components/HomeArtBackdrop.tsx`, portalled onto the whole Home screen (the carousel's container query makes it a containing block, so it could not cover the top bar from inside). Blur is level × 0.25rem, set, never animated. The whole image shows, edges included (owner decision, 2026-11-10): it used to be scaled 1.1 so the blurred edges stayed outside the screen, which cut its borders. Now the image is not blurred itself; the darkening layer above it, black at the chosen opacity, blurs what is behind it with a `backdrop-filter`, which repeats the image at the edges instead of fading them, and is one blur over both images during a crossfade. A new game's image fades in over the previous one (opacity only, `--motion-screen`; none with reduced motion), and the old one leaves when the fade ends. It changes only once the focus stops for 150 ms, so a held direction does not swap a large blurred image every 110 ms; the first image, when the screen opens or comes back, shows at once.

### 3.25 D-26 — Removing Steam games, with exceptions (Accepted, after Phase 8)

**Owner decisions (2026-11-08):** Steam games get "Remover jogo" in their options (game page, Library and Home), installed or not, unavailable while the game runs. The confirmation has three choices: "Cancelar" (initial focus), "Remover" and "Remover e criar exceção" (red). Its text says the game, the playtime recorded in Equon, the achievements and the art are erased from Equon, that nothing changes on the Steam account, that "Remover" brings it back only when the user next presses "Atualizar biblioteca" in Settings, while it is still owned or installed (owner decision: not on the next start, nor through the 10 s check), and that with the exception it **will not be added to Equon again**. The exceptions are listed in Configurações › Conexões, in the Biblioteca panel ("Jogos ignorados", shown only when there are any), where each one can be taken off after a confirmation; it then becomes a plain removal and comes back the same way.

**Where it lives.** A new table, `STEAM_IGNORED` (App ID, title for the list, `permanent`, date; migration 0018, `DATA_BASE_CONTEXT.md` §3.13). It is not tied to `GAMES`, since the game row is gone. Both kinds of removal are stored, so a plain one survives a restart: `permanent = 1` is an exception, `permanent = 0` a plain removal, which the user's "Atualizar biblioteca" forgets before scanning (the startup refresh does not). The three Steam sync paths go through the core (`steam-library.ts`): the full refresh and the 10 s check drop ignored App IDs from the scan result before planning, and the owned-games import skips them, so the rule sits in one place. A failed or partial scan keeps its usual rules; an ignored game is simply not there.

**Removing.** `removeSteamGame` (core) runs in one transaction: it refuses anything but a Steam game (NotFoundError), adds the exception when asked, deletes the game (sessions, achievements, genres, launch config and art rows cascade) and recomputes the trophy counters from `ACHIEVEMENTS`. Main then deletes the game's art folder, as for manual games. Its own IPC channel (`games:remove-steam`, App ID never taken from the renderer: only the game id and a boolean), plus `library:ignored` and `library:unignore`. Nothing is sent to Steam; uninstalling stays D-23.

### 3.26 D-27 — Home covers: size, spacing and position (Accepted, after Phase 8)

**Owner decisions (2026-11-09):** a "Capas da home" section in Configurações › Aparência, under the background art, with "Tamanho" and "Espaçamento" (levels 1 to 100) and "Posição" ("Centro" or "Embaixo"). "Centro" is the layout the Home screen had; "Embaixo" puts the row, with the focused game's name, close to the footer, like a console's home screen. "Em cima" (owner decision, 2026-11-10) is "Embaixo" mirrored top to bottom, with the same behavior: the shelf by the top bar, the small covers level with the focused cover's top, the name 10px under them and no shade from the top (owner decision, 2026-11-11), but a vignette from the top of the screen, behind the top bar, that darkens the edges around a clear area on the right, where the art's subject usually is (owner decision, after the PS5 home). "Em cima" alone also shows the focused game's logo in the free space under the shelf, left-aligned with the focused cover, whole, with a drop shadow (the dark glow behind it was dropped, owner decision, 2026-11-11), fading with the name (owner decision, 2026-11-11); a game without a logo shows none. Its recommended values are its own (0, 10%, 18 and 4).

**The numbers.** The cover is 7rem + size × 0.25rem wide and the space between covers is gap × 0.1rem. 100 gives 32rem, the largest cover that still looks right (owner decision, after trying the first scale); the defaults, 74 and 35, give exactly the old 25.5rem and 3.5rem. "Centro" uses the portrait cover (2:3, as before). "Embaixo" is a shelf after the PS5 home (owner decisions): square covers without the Library's status badges; the focused one at the set size, where the first cover is, while the row moves under it instead of centering it; the others smaller than it by the name's height plus 10px, level with its bottom; and only the name, no playtime, in a new 24px token (`--font-size-shelf-title`), with a dark text shadow, in that room next to the focused cover and above the small ones, 10px above them; twice the gap on each side of the focused cover; and a dark shade in the background color behind the covers, fading up into the art. rem follows the window size (base.css), so the result is the same at 1920×1080 and 1280×720. Only the cover changes size; the name and playtime keep theirs (owner decision). The position is worked out for the whole set, cover, name and playtime (owner decision): the name block has a fixed height, worked out from the tokens, so the set is the same for every game, with or without playtime, and the row never moves while the focus does. "Centro" centers the set in the area between the top bar and the footer through container query units (`cqh` of the Home `main`), so it stays centered at any size; with the defaults the row sits about 1.2rem higher than the old fixed top padding. "Embaixo" puts the covers a little above the footer. A set too tall for the screen starts at the top and is cut at the bottom. In both positions the focused game's name shows in full on one line, past the cover's width if it must (owner decision).

**Two layouts.** "Centro" and the shelf are each their own component (owner request), which `HomeScreen` picks from the setting: `home/CenteredCovers.tsx` and `home/CoverShelf.tsx`, each with its CSS. "Em cima" and "Embaixo" are the same `CoverShelf` with a `side`; only what depends on the side (the anchor, the shrink origin, the name and the shade) is overridden in CSS under `[data-side='top']`, so the two cannot drift apart. What they share, the focused card, the name that fades out and in for the new card, the background art (D-25) and the restored focus, is one hook, `home/useCoverFocus.tsx`. On the shelf every cover is laid out at the full size in the same spot and placed and shrunk by a transform worked out from its distance to the focus (`--rel`), so a change of focus animates transforms only and the row never reflows.

**Where it lives.** Three `USERS` columns (`home_cover_size`, `home_cover_gap`, `home_cover_position`, migration 0019), each with a `CHECK`; the IPC schema takes only what changed, within range. The renderer reads them once at start (`data/home-covers.ts`) and Settings updates them as they change, shown at once and undone if saving fails, like D-25. The two levels use `LevelRow`, which draws a continuous bar instead of ticks past 20 steps; the position uses `OptionRow`, both options side by side: left and right pick one (at either end they move the focus on, so it is never trapped), A moves to the next, and the mouse clicks one.

### 3.27 D-28 — A on a Home cover can start the game (Accepted, after Phase 8)

**Owner decisions (2026-11-10):** a "Ignorar tela do jogo na home" checkbox in Configurações › Sistema, off by default. When on, A on a Home cover starts the game, in any of the three cover positions (D-27), instead of opening its page; the Library and every other screen still open the page. The footer hint for A says "Jogar" instead of "Abrir", and A plays the Play sound (D-24).

**Starting.** It is the same `games:launch` as the page's Jogar, so everything Jogar does holds: the launch image (D-22), the running check and the session. One launch at a time: another A while one is on its way does nothing. If the game cannot start (a missing executable, an emulator not configured, the game already running), the Home screen has nowhere to say why, so the game's page opens, and it explains the reason as it always does.

**The page.** With the option on, the Home options menu (menu button) starts with "Ver página do jogo", the only way to the page from Home; with it off, the item is not there.

**Where it lives.** One `USERS` column, `home_direct_launch` (`INTEGER` 0/1 with a `CHECK`, default 0, migration 0021), read once at start (`data/home-launch.ts`) and updated by Settings when it changes. `HomeScreen` decides what A does and hands it to both cover layouts.

### 3.28 D-29 — "Em cima" panel: play stats and latest achievements (Accepted, after Phase 8)

**Owner decisions (2026-11-11):** "Em cima" alone shows, under its shelf, a panel about the focused game: its logo (moved here from the shelf) at the top; at the bottom left, by the footer, "Últimas conquistas" (the progress count next to it was dropped, owner decision, 2026-11-12) and under it the 4 latest unlocked achievements as tiles (icon and name) followed by "Ver todas"; at the bottom right, only the playtime, on a dark see-through chip (owner's sketch and decisions). "Em cima" fixes its size at 18 and its spacing at 4, to leave room for the panel; in Aparência the two levels are unavailable there and say "(fixo no Em cima)", and the stored levels stay as they are for the other positions.

**Navigation.** Down on the focused cover enters the row, on the first achievement (with no row, down does nothing). Left and right walk the row; up, or B, goes back to that very cover, never to another. The focused achievement is described under the row: tier, name, description, global rarity and unlock date. A on an achievement or on "Ver todas" opens the game's achievements page; the focus is put back on the game's cover first, so coming back lands there. While the focus is in the panel the shelf keeps that game focused.

**Data.** Only the local database: the existing `achievements:game`, asked once the focus settles on a game (150 ms, like the background art, D-25) and again when main reports a change. No new column. Icons are downloaded when the user comes down to the panel, an explicit request like opening the achievements page (owner decision; `DATA_BASE_CONTEXT.md` §4.3); until then a cached icon shows and a missing one is an empty square. Without any achievement unlocked (a game without achievements, never synced, none unlocked yet), and while loading or after an error, the whole achievements block is left out (owner decision), so down on the cover has nothing to enter; the logo and the playtime stay.

**Code.** `home/TopHome.tsx` puts `CoverShelf` (unchanged for "Embaixo") and `home/GameSpotlight.tsx` together: the shelf takes a `below` slot, drawn inside it so the panel uses its sizes, and an `onCardDown` for entering the panel. A panel too tall for the window is cut at the bottom; with the fixed size there is room at 1920×1080 and 1280×720 (not yet checked on screen).

### 3.29 D-30 — "Imagem da home", a seventh art kind (Accepted, after Phase 8)

**Owner decisions (2026-11-11):** a new art kind, `home` ("Imagem da home"), used only as the Home background (D-25), in the three cover positions. By default it is the launch image, then the background: the Home background shows the Home image, else the launch image, else the background (`data/home-art.ts`). The launch cover (D-22) is unchanged and keeps using the launch image.

**Editing.** A sixth panel in "Editar artes" (§3.18), after "Imagem de abertura", with the same sources, all 16:9: the IGDB image (the same background-shaped picture as the launch image), the Steam gallery and a local file. Nothing downloads it automatically. With no image of its own, the panel previews what the Home would use and says "Usando a imagem de abertura" or "Usando a imagem de fundo", following choices and removals of the same visit. Removing it deletes only the Home image.

**Storage.** Migration 0022 rebuilds `GAME_ARTWORK` and `GAME_ARTWORK_REMOVED` with `'home'` in the kind `CHECK`, copying every row (as 0013 did for the launch image). The import checks it is 16:9, like the background and the launch image.

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
| Session observation | Best-effort: registry `RunningAppID` polled every 2 s (D-12) | Reliable for direct child processes |
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

### Data sources

- Definitions: `ISteamUserStats/GetSchemaForGame/v2` (needs the key; `l=brazilian`).
- Player state: `ISteamUserStats/GetPlayerAchievements/v1` (needs key and Steam ID).
- Global rates: `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2` (no key; `percent` comes as text).
- Formats validated on 2026-11-04 against a real account (33 games).
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

**Phase 7 decisions:** `GAMES.achievements_synced_at` tells "never synced" from "no achievements". The sync after a close waits 10 s so Steam can record what was unlocked, and is silent without credentials. A full sync pauses 1 s between games. Stale state (the last attempt for a game failed) is kept in memory for the run. Icons are downloaded only when a game's screen opens, served by `equon-art://achievement/<id>/<locked|unlocked>`; locked rows use Steam's `icongray` (`ACHIEVEMENTS.icon_locked`), which is not always a grey copy of the unlocked art; `steamcdn-a.akamaihd.net` joined the image host allowlist. The overview total counts platinum games too, and hidden games are listed (owner decisions).

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

A failed scan must not mark every game from that source as uninstalled. The planning part is the Phase 5 discovery contract (§8). Phase 6: refresh at startup and from Settings › "Atualizar biblioteca"; duplicate candidates (a newly found Steam game whose title matches a manual game) are kept in memory and reviewed in Settings: "Manter os dois", "Ocultar o jogo manual" or "Remover o jogo manual". A candidate only appears when the Steam game is first discovered, so no table is needed. Owner decision (Phase 8): a local check repeats the scan every 10 s and when the window gets focus, so games installed or removed in Steam show up on their own. It uses no network, writes only what differs and is skipped while any game is running. Owner decision (Phase 7): every refresh, at startup and from the button, also reads `GetOwnedGames` after the local scan and creates the owned games the library is missing (`installed = 0` only after a complete scan, otherwise `NULL`); a failure there never affects the local scan and is reported next to its result. Main keeps one background-activity state (achievements, library refresh, metadata, artwork; `src/main/background-activity.ts`), published over IPC to the top bar indicator.

### Library view (Phase 5)

Search, filters and sorting are pure functions in `src/shared/library-view.ts`, applied in the renderer to the summaries it already holds (`games:list` returns every game with its `hidden` flag). The view state lives in an app-level React context: it survives navigation and resets on restart, so no preference is persisted (the open question about where to persist preferences stays open). Home uses the fixed `homeGames` rule: every installed, non-hidden game (no limit), most recent session first. Manual flags are written through `games:set-flags` (validated `{ hidden?, beated? }`, every origin).

### Metadata and genres

For Steam, use `appdetails`: check the success flag, validate optional fields, normalize, then persist. Never overwrite `hidden` or `beated`, and never replace valid values with empty strings after a network or format error. Genre names are normalized to avoid duplicates. Metadata sync is separate from installation detection and session measurement. Fetched only on discovery or when adding a game, with retry after failures (§3.14, D-16).

### Launch and session

1. Validate the launch configuration (§7).
2. Invoke the adapter's launch. For Steam, open `steam://rungameid/<appid>` built in the main process (D-17) and confirm the start by observing the game in the registry `RunningAppID`.
3. Insert a `running` session and observe the process where feasible: for Steam games through the registry `RunningAppID` (D-12), for manual games through the launched process.
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

- **Fullscreen presentation (fix after Phase 6):** in fullscreen on Windows, one-off updates with no animation after them (Settings tabs, the Achievements screen) could stay off screen until the next change, although the DOM had updated within 8 ms. Measured on the owner's machine with a real controller: a permanent 2 px animation made the problem disappear, and so did `--disable-direct-composition` without it (36 presses in fullscreen, no failure). The launcher sets that Chromium switch at startup because it has no continuous GPU cost. The failure is intermittent, so these results are strong evidence, not proof; other GPUs were not tested.
- **Blank covers in fullscreen (found in Phase 8):** in fullscreen, a cover drawn for the first time could stay blank until something changed on it, although the page had it loaded with no error; rows already drawn never failed. Reproduced on the owner's machine by reading the real monitor during one descent of the Library (F11 on a fresh launch): 10 blank covers in 3 of 14 stops without the fix, none in 35 stops with `--disable-checker-imaging`, which makes raster wait for the image decode. The worst frames did not change in a way that matters (at most 22 ms against 17 ms, nothing above 33 ms), and the owner confirmed it with a real controller. Why this prevents the blank frame inside Chromium was not proven. Windowed runs showed nothing, but they were checked before this walk existed.
- **Measurements (Phase 8a, 2026-11-04):** production build, dev data folder with about 300 games, Ryzen 5 5500, 32 GB, RX 6600, measured before the fullscreen fix above. Launch to the first card about 0.57 s (repeated launches, not the first after booting; the card in the page, not yet painted). Section switch: at most 79 ms to the screen and 168 ms to its visible images. "Atualizar biblioteca" 0.6 to 0.8 s, including one `GetOwnedGames`. Held stick: no frame above 33 ms, no long tasks; these frames measure the page, not GPU raster. Memory: 360 MB idle, 1.1 GB after walking the whole Library, about 720 MB 30 s later; the JS heap is 10 MB, so nearly all of it is images. Disk: about 765 MB of artwork, 2.7 MB per game. Covers are stored at 1024 px and shown at 271 px, and the largest logo is 11704 px wide (14 MB). The owner kept this as it is: nothing is slow, memory comes back, and reprocessing the cache risks damaging transparent logos. Limiting stored sizes is the first thing to try if the launcher ever has to run on a much weaker machine.
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
- One launcher per data folder (`requestSingleInstanceLock`): a second launch brings back the open window, since a second instance would close the first one's running sessions as interrupted.
- A dead renderer process reloads the window once; a second crash within 60 s tells the user and quits. A screen that throws while rendering shows a message with a way home, reachable by controller (`ScreenErrorBoundary`).
- Artwork and achievement icons are written through a temporary file: a crash or a full disk never leaves a cut image taken as cached, and a failed write keeps the previous image.
- **Measured in Phase 8b (dev data folder, real app):** closing during sync exits in under 1 s; killing the process during a full sync leaves the database intact (`integrity_check`, foreign keys) and it reopens normally; with every request failing, the window opens in about 0.4 s, local flows work, the reason appears next to the refresh result and the database does not change. With no network the background queues stop at the first failure (§3.13).

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
| 2026-11-04 | 0.22 | Phase 7: achievements sync (after a close and manual), overview and per-game screens, `achievements_synced_at`, on-demand icons. |
| 2026-11-04 | 0.23 | Owner decision: owned Steam games missing from the library are created from `GetOwnedGames`, at startup and on "Atualizar biblioteca"; Steam play stats still overwrite only once per start. |
| 2026-11-04 | 0.24 | Top bar indicator for achievement sync, background Steam sync and artwork downloads, fed by one main-process activity state. |
| 2026-11-04 | 0.25 | Fullscreen blank covers fix: `disable-checker-imaging` at startup (§12). |
| 2026-11-04 | 0.26 | Phase 8a: performance measurements (§12); no cache eviction and no limit on stored artwork sizes (§3.13). |
| 2026-11-05 | 0.27 | Phase 8b: single instance, renderer crash recovery, screen error boundary, atomic artwork writes, database failure messages and verified recovery (§13). |
| 2026-11-05 | 0.28 | SteamGridDB search for Steam games; artwork not retried at startup once answered (`artwork_checked_at`); queues stop with no network (§3.13). |
| 2026-11-05 | 0.29 | D-13 accepted: NSIS per user, unsigned, no automatic updates; fixed data folder (§3.16). Preferences: nothing to persist for now. |
| 2026-11-05 | 0.30 | Local Steam check every 10 s and on window focus, paused while a game runs. |
| 2026-11-05 | 0.31 | Background queues tell no network from a server that cannot serve (§3.13). |
| 2026-11-05 | 0.32 | Phase 8d: security review (§3.16): own app menu, Electron fuses, capped image downloads, Electron 44.10.2. |
| 2026-11-05 | 0.33 | D-18: IGDB connection for manual games (§3.17). |
| 2026-11-05 | 0.34 | D-18: the add form starts with name and executable; IGDB as an artwork source; portrait covers accept up to 3:4 (§3.17). |
| 2026-11-05 | 0.35 | D-18: IGDB first for the portrait cover, logo and background of Steam games (§3.17). |
| 2026-11-05 | 0.36 | D-18: smaller add form; IGDB is asked on saving; ROMs detected by file (§3.17). |
| 2026-11-05 | 0.37 | D-18: "Buscar artes no IGDB" in the options menu (§3.17). |
| 2026-11-05 | 0.38 | Home covers shown 3:4, always stretched to show the whole art (§3.17). |
| 2026-11-05 | 0.39 | D-19: "Editar artes", with a SteamGridDB gallery and `GAME_ARTWORK_REMOVED` (§3.18). |
| 2026-11-06 | 0.40 | Home covers back to 2:3, still stretched; SteamGridDB first for portrait covers, IGDB as fallback (§3.17). |
| 2026-11-06 | 0.41 | D-20: Settings › Sistema; preferences live in `USERS`, starting with Windows is read from Windows (§3.19). |
| 2026-11-06 | 0.42 | D-21: system menu on the Xbox button (button 16, measured); the gear in the top bar is gone (§3.20). |
| 2026-11-06 | 0.43 | Library: sorts by origin, install state, hidden and beaten (`PRODUCT.md` §6.4); "Instalado" and "Zerado" badges on its cards. |
| 2026-11-06 | 0.44 | Library: sort by achievement percentage; `GameSummary` carries it and the list refreshes on `achievementsChanged`. |
| 2026-11-06 | 0.45 | "Editar artes": Steam gallery for backgrounds, with the store background and the screenshots (§3.18). |
| 2026-11-07 | 0.46 | The window asks for the focus when it appears; until first used, a controller press brings it to the front (§3.20). |
| 2026-11-07 | 0.47 | D-22: image over the screen while a game opens (§3.21). |
| 2026-11-07 | 0.48 | D-23: installing and uninstalling Steam games through Steam's own windows (§3.22). |
| 2026-11-07 | 0.49 | Settings › Armazenamento: free space of each disk, read in main with one fixed, read-only PowerShell script (`src/main/system/drives.ts`), by absolute path, with no shell. Network drives are left out. |
| 2026-11-07 | 0.50 | `.url` shortcuts: opening one moves the game's last played time forward (`DATA_BASE_CONTEXT.md` §3.7); playtime is still not measured. |
| 2026-11-07 | 0.51 | "Imagem de abertura": art kind `launch` (migration 0013), edited in "Editar artes" and shown first while a game opens (§3.18, §3.21); the image leaves 1 s after the game opens instead of 3 s. |
| 2026-11-07 | 0.52 | The launch cover says "Carregando" with animated dots in the bottom right corner, gone at once before the fade out; it leaves 2 s after the game opens (§3.21). |
| 2026-11-07 | 0.53 | "Editar jogo" for Steam games, with description, developer, release date and age rating only (owner decision). Its own IPC channel (`games:update-steam`) with a strict schema of those fields, and a repository write limited to Steam games; store metadata now only fills empty fields (`DATA_BASE_CONTEXT.md` §3.1, §4.2). Start submits the add and edit forms, like their main button. |
| 2026-11-07 | 0.54 | Steam games' edit form: a "Preencher com IGDB" per field, replacing that field only; the game confirmed on IGDB is kept while the form is open; genres stay Steam's (owner decision). |
| 2026-11-07 | 0.55 | Emulator ROM folder (migration 0014, `emulators.rom_directory`): its loose `.nsp`/`.xci` games are added at startup, on "Atualizar biblioteca" and when the folder is chosen, and filled from IGDB only under the very same name, an exception to D-18's confirmation (§3.17, `DATA_BASE_CONTEXT.md` §3.12). |
| 2026-11-07 | 0.56 | Steam's DEJUS rating: an age DEJUS does not have (Steam generates "6") goes up to the nearest official rating, never down (`DATA_BASE_CONTEXT.md` §4.2). Migration 0015 has the unrated Steam games fetch their store data once more (a one-time exception to D-16, like 0005). |
| 2026-11-08 | 0.57 | D-24: interface sounds, with "Sons da interface" in Configurações › Sistema (`USERS.ui_sounds`, migration 0016) and `media-src 'self'` in the CSP (§3.23). |
| 2026-11-08 | 0.58 | D-24: LB/RB play JDSherbert's swipe, kept out of the public repo by its license, with the move sound as the fallback (§3.23). |
| 2026-11-08 | 0.59 | D-25: game art behind the Home screen, set in a new Settings tab, "Aparência" (`USERS.home_art_*`, migration 0017; §3.24). |
| 2026-11-08 | 0.60 | D-16: the store answering that a game has no page (`appdetails` `success: false`) counts as an answer: `metadata_fetched_at` is set and nothing stored, so a closed beta or a delisted game is not asked again on every start (`DATA_BASE_CONTEXT.md` §3.1). |
| 2026-11-08 | 0.61 | D-26: "Remover jogo" for Steam games, with "Remover e criar exceção" kept out of every sync (`STEAM_IGNORED`, migration 0018) and a "Jogos ignorados" list in Configurações › Conexões; a plain "Remover" comes back only on the user's next "Atualizar biblioteca" (§3.25). |
| 2026-11-09 | 0.62 | D-27: "Capas da home" in Configurações › Aparência: size and spacing of the Home covers (1–100) and their position, Centro or Embaixo (`USERS.home_cover_*`, migration 0019; §3.26). |
| 2026-11-10 | 0.63 | D-27: "Capas da home" › Posição gains "Em cima", the "Embaixo" shelf mirrored; migration 0020 rebuilds `USERS` to widen the CHECK (§3.26). |
| 2026-11-10 | 0.64 | D-28: "Ignorar tela do jogo na home" in Configurações › Sistema: A on a Home cover starts the game; a failed launch opens its page; "Ver página do jogo" in the Home options menu (`USERS.home_direct_launch`, migration 0021; §3.27). |
| 2026-11-11 | 0.65 | D-29: "Em cima" panel under the shelf, with play stats and the latest achievements, navigable; "Em cima" fixes size 18 and spacing 4 (§3.28). |
| 2026-11-11 | 0.66 | D-30: "Imagem da home", art kind `home` (migration 0022), edited in "Editar artes"; the Home background uses it, then the launch image, then the background (§3.29). |
| 2026-11-04 | 0.21 | Emulators move from a Library button and screen to a Settings tab. |
| 2026-11-04 | 0.20 | Fullscreen presentation fix: `disable-direct-composition` at startup (§12). |
| 2026-11-04 | 0.19 | Phase 6c: artwork queue (Steam `header_image` and `background_raw`, best-voted SteamGridDB covers and logo), image host allowlist, WebP header check, SteamGridDB search for manual games, duplicate review in Settings. |
| 2026-11-03 | 0.18 | Phase 6b: `appdetails` in Portuguese with the owner-chosen fields, `GetOwnedGames` sync after the startup scan, "Testar conexão" (Steam `GetPlayerSummaries`, SteamGridDB). |
| 2026-11-03 | 0.17 | Phase 6a: no Steam folder override; running state from the registry `RunningAppID` (the manifest `AppRunning` flag is not set in practice); local Steam scan at startup and on "Atualizar biblioteca"; Settings screen (gear in the top bar: Conexões, Sobre). |
| 2026-11-03 | 0.16 | Phase 5: discovery contract (§8) and library view (§11). |
| 2026-11-02 | 0.15 | Phase 4 owner changes: emulators become a separate feature (`EMULATORS`, Yuzu only, ROM-only games, `-f -g "<rom>"`), replacing emulator defaults on origins; `.url` shortcuts accepted with a scheme allowlist and no playtime measurement |
| 2026-11-02 | 0.14 | Phase 4 decisions: emulator defaults on origins (pre-fill only), `playtime_offset` for user-entered playtime, manual install state from the executable, own file browser with native-dialog fallback, local artwork import rules, new input actions (X, Y, LT, RT) and text-entry mode |
| 2026-11-02 | 0.13 | Phase 3 decisions: own focus manager; `previousSection`/`nextSection` actions (LB/RB); `equon-art://` protocol for cached artwork; React Testing Library + jsdom; separate dev user-data folder and seed script |
| 2026-11-02 | 0.12 | D-08: Steam playtime and last played synced once per launcher start (GetOwnedGames) and overwritten; sessions add on top until the next start (`steam_playtime_baseline`, `steam_synced_at`) |
| 2026-11-02 | 0.11 | Phase 2 decisions: D-05 changed to an extensible `ORIGINS` table (built-in `steam`, `manual`, `yuzu`, `ps2`; user-created origins); D-08 interrupted sessions add time up to their last heartbeat (`last_seen_at`) |
| 2026-11-01 | 0.10 | Phase 1: recorded spike results (§3.1); better-sqlite3 13 needs no rebuild (N-API prebuilds), rebuild scripts dropped (§3.3, §3.15); electron-vite 6 confirmed maintained (release 2026-10-14) |
