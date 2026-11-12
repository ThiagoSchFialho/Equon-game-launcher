# CLAUDE.md — Equon Game Launcher

Controller-first game launcher for Windows (Electron + React + TypeScript, embedded SQLite). One local user, one Steam account. Games come from Steam (automatic) and manual entries. There is **no** automatic Epic/GOG integration: those games are added manually. Origins are an extensible table (built-in `steam`, `manual`, `yuzu`, `ps2`; the user can add more, e.g. a new emulator); only `steam` has an automatic adapter. Emulators are a separate feature (`EMULATORS`, only Yuzu): Yuzu games store just the ROM and open with `yuzu.exe -f -g "<rom>"`. A configured emulator may have a ROM folder whose loose `.nsp`/`.xci` games are added automatically (`DATA_BASE_CONTEXT.md` §3.12).

## Language

- Talk to the owner in **Portuguese (pt-BR)**.
- Write code, identifiers, comments, commit messages and new English docs in **English**.
- `PRODUCT.md`, `DATA_BASE_CONTEXT.md` and `DESIGN_SYSTEM.md` are in Portuguese; keep them in Portuguese when editing.

## Source of truth (read before coding)

1. `docs/ARCHITECTURE.md` — decision log (D-01…D-32), process model, layers, security. **Start here.**
2. `docs/DATA_BASE_CONTEXT.md` — schema, integrity rules, sync rules.
3. `docs/PRODUCT.md` — MVP scope and acceptance criteria.
4. `docs/DESIGN_SYSTEM.md` and `design/` — visual tokens and mockups.
5. `docs/ROADMAP.md` — phases and acceptance criteria.

If code and docs disagree, stop and ask. When a decision changes, update the docs **in the same commit**. Never invent tables, columns, built-in origins, art types or decisions that are not in the docs; propose them first.

## Current status and scope of work

- All roadmap phases (0–8) are complete (Phase 1 spike results: `docs/ARCHITECTURE.md` §3.1). **Work only on what the owner asks for**; do not start anything new on your own.
- Before non-trivial work, propose a short plan and wait for approval.
- No open decisions at the moment. If a task depends on one, ask instead of deciding.

## Stack and tooling (accepted)

- npm (commit the lockfile); pin Node and Electron versions.
- electron-vite (separate main / preload / renderer builds); strict TypeScript.
- Vitest for tests; ESLint (flat config) + Prettier.
- SQLite via `better-sqlite3`, hand-written SQL in repositories, no ORM, versioned `.sql` migrations tracked with `PRAGMA user_version`.
- Persistence lives in `src/infrastructure/persistence` (the only place allowed to import `better-sqlite3`, enforced by lint). Add a schema change as a new `migrations/000N_*.sql` plus an entry in `migrations/index.ts`; never edit a released migration. Repositories implement the sync ports in `src/core/application/ports.ts`; tests use `tests/helpers/db.ts` (in-memory, migrated).
- Scripts: `npm run dev`, `npm run dev:seed` (dev library with sample games), `npm run build`, `npm start` (preview build), `npm test` (Vitest, run once), `npm run lint`, `npm run typecheck`, `npm run format`. Node 24.18.0 (`.nvmrc`), Electron 44.10.2 (exact).
- If Electron fails with `electron.app` undefined, `ELECTRON_RUN_AS_NODE=1` is set in the shell (VS Code sets it); unset it for `dev`/`start`.
- If Vitest fails with "failed to find the runner" / "reading 'config'", the shell is in `d:\` in lower case (the VS Code terminal can be); run it from `D:\`.
- Unpackaged runs use the `equon-game-launcher-dev` data folder; never seed or test against the real one. To test the packaged app, pass `--user-data-dir=<temp folder>`. Installer: `npm run build:win` (NSIS, per user, unsigned; `ARCHITECTURE.md` §3.16).
- Renderer: one `FocusManager` (`src/renderer/src/focus`); components use `useFocusable` / `useScreenActions` and semantic actions from `src/renderer/src/input`, never raw buttons or keys. UI text lives in `src/renderer/src/strings.ts` (pt-BR). Artwork is loaded only via `artworkUrl()` (`equon-art://game/<id>/<kind>`). Renderer tests use `// @vitest-environment jsdom`.
- Sandboxed preload can only load `electron`; it imports constants/types from `src/shared/ipc/contract.ts` (no runtime deps). zod schemas live in `src/shared/ipc/schemas.ts` and are used by main.
- **Native module rule:** `better-sqlite3` ≥ 13 ships N-API prebuilds, so one binary serves Node (tests) and Electron (app); there are no rebuild scripts. `tests/native/better-sqlite3.test.ts` guards this; if it fails with a load / `NODE_MODULE_VERSION` error, the prebuilds changed and rebuild scripts must come back (`ARCHITECTURE.md` §3.15). Run tests through `npm test`.

## Architecture rules

- **Processes:** main (privileged: DB, filesystem, processes, HTTP, secrets) / preload (small typed `contextBridge` API) / renderer (React UI, no Node, no secrets, no DB).
- Window settings: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, restricted navigation, CSP. Never expose raw `ipcRenderer`, arbitrary file access or command execution.
- **Layers:** `core/domain` (pure rules) → `core/application` (use cases + ports) → `infrastructure` and `integrations` (implement ports) → `main` wires everything. `renderer` only imports `shared` and talks to main through the preload API.
- `core` must not import Electron, Node filesystem/process APIs, network libraries or SQL. Lint rules (`no-restricted-imports`) must enforce this.
- Validate every IPC payload and every external API response with explicit schemas.
- One adapter per source with declared capabilities; a failing integration must never break the rest of the library.

## Data rules (non-negotiable)

- Run `PRAGMA foreign_keys = ON` on **every** connection.
- Booleans are `INTEGER` 0/1; timestamps are ISO-8601 UTC `TEXT`; SteamID64 is `TEXT` (exceeds JS safe integers); App IDs are `INTEGER`.
- `GAMES.installed`: `1` installed, `0` confirmed not installed, `NULL` unknown. **A failed read must never write `0`.** Absent games become `0` only if `libraryfolders.vdf` and every library were read successfully; otherwise `NULL`.
- Never overwrite `hidden`, `beated` or user-selected artwork during sync/upserts.
- `playtime` (minutes) = `floor(sum of completed + interrupted session seconds / 60)`, recomputed in the same transaction that closes the session. Every observed session counts, for every origin. Non-Steam games add the user-entered `playtime_offset`. If the launcher dies, `running` sessions become `interrupted` at their last heartbeat (`last_seen_at`). Never negative.
- Steam games: once per launcher start, `GetOwnedGames` overwrites `time_last_played` and the Steam baseline; then `playtime = steam_playtime_baseline + floor(seconds of counted sessions started since steam_synced_at / 60)`. A failed sync changes nothing. This is the only automatic sync at startup (`DATA_BASE_CONTEXT.md` §3.11).
- All tables are `STRICT`; booleans and enums always have `CHECK`s.
- Related writes (session + playtime, achievements + counters) happen in **one transaction**. Repeated syncs with the same data change nothing.
- `tier` and platinum are pure domain functions; trophy counters are recomputed from `ACHIEVEMENTS`, never incremented blindly. Unknown `global_percent` is `NULL`, never `0`.
- Metadata (`appdetails`) is fetched **only on discovery/add**, `metadata_fetched_at` is set only after a valid response or the store's definite "no page" (`success: false`, which stores nothing), and failures are retried on later refreshes.

## Steam rules

- Discovery: Windows registry `SteamPath` (via `reg.exe`, fallback to the default folder; no user override) → `libraryfolders.vdf` → `appmanifest_*.acf` → `StateFlags`. Local scan at startup and on "Atualizar biblioteca"; a local check every 10 s and when the window gets focus applies only what changed (no network; skipped while a game is running). Ignore non-game manifests. Pin behavior with fixtures; the flags are not an official contract.
- Owned games: after every local scan (startup and "Atualizar biblioteca"), `GetOwnedGames` creates the owned games the library is missing, with `installed = 0` only after a complete scan, otherwise `NULL`. The button never overwrites the play stats of games already synced.
- Launch: `steam://rungameid/<appid>`, built in main from a validated numeric App ID taken from the DB, never from renderer strings. A launch counts as started only when the registry `RunningAppID` shows the game (with timeout); a session starts then. Steam sessions follow `RunningAppID` (polled every 2 s), for games started by the launcher or by Steam; the manifest `AppRunning` flag is not used (Steam does not set it).
- Offer Play only when `installed = 1`. Install and uninstall open Steam's own windows (`steam://install/<appid>`, `steam://uninstall/<appid>`, D-23), built in main like the launch URL; never automate those windows or use SteamCMD.
- Achievements: sync only the game that just closed, plus a manual full sync. Never periodic or automatic full-library sync. Validate current Steam Web API formats before implementing.

## Security

- API keys (Steam, SteamGridDB, IGDB's Twitch credentials) are encrypted with Electron `safeStorage`, decrypted only in main, never sent to the renderer, never logged. Never log URLs containing keys.
- Executable paths, ROM paths, arguments and working directories are **untrusted**: validate, pass arguments as an array, never use a shell or build command strings. `.url` shortcuts are read in main and only allowlisted store schemes are opened.
- Only open external URLs built in main from an allowlist.
- Never commit secrets, databases or artwork cache.

## Artwork

- Seven kinds: `cover_square` (Library), `cover_portrait` (Home, shown 2:3), `logo`, `background` 1920×1080 (Game details), `header` (Achievements list), `launch` 16:9 (shown while a game opens, D-22; falls back to `background`; only chosen by the user, never downloaded automatically), `home` 16:9 ("Imagem da home", the Home background, D-30; falls back to `launch`, then `background`; only chosen by the user).
- Sources: Steam `appdetails`, SteamGridDB (user's own key), IGDB (user's own Twitch app, D-18: fills manual games; first source of logo and background for Steam games, found by App ID; fallback for the portrait cover, which comes from SteamGridDB first), local files. **No Google Images or scraping.**
- "Editar artes" (D-19, `ARCHITECTURE.md` §3.18) changes each image by hand; chosen images wait in memory until Salvar. Art the user removed stays in `GAME_ARTWORK_REMOVED` and automatic downloads must skip it.
- Portrait covers accept 2:3 to 3:4; the Home card is 2:3 and stretches the whole art to fit, never cropping or letterboxing (owner decision). Fetch lazily through a throttled queue, validate downloads (type, size, decoded dimensions), cache on disk, never hotlink at runtime. The app must work with placeholders and without a SteamGridDB key.

## UI and controller

- Use only the tokens in `DESIGN_SYSTEM.md`; do not invent palettes or type scales per screen.
- Input: poll the browser Gamepad API each frame; translate to semantic actions (`confirm`, `back`, directions, `scroll`, `menu`). Components never use raw button indices. Keyboard and mouse map to the same actions.
- One focus manager; focus must stay visible and never be trapped. Every screen needs default, focus, unavailable, empty, loading and error states.
- Animate only `transform` and `opacity`; respect reduced motion. Do not hardcode numbers from mockups.
- Validate at 1920×1080 and 1280×720.

## Working agreements

- Small, focused commits; no unrelated refactors; no dependency without justification.
- Tests proportional to risk: repository tests against real in-memory SQLite, adapter tests with fixtures, simulated failures. Routine tests must not call live Steam or SteamGridDB endpoints.
- Verify controller/UI behavior manually where relevant and say what was not verified.
- When finishing a task report: changed files, tests run and results, known limitations, and any doc updated.
- If something is ambiguous or listed as open, ask the owner instead of guessing.