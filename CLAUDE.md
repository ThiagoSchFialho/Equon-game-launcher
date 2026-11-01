# CLAUDE.md — Equon Game Launcher

Controller-first game launcher for Windows (Electron + React + TypeScript, embedded SQLite). One local user, one Steam account. Games come from Steam (automatic) and manual entries. There is **no** automatic Epic/GOG integration: those games are added manually.

## Language

- Talk to the owner in **Portuguese (pt-BR)**.
- Write code, identifiers, comments, commit messages and new English docs in **English**.
- `PRODUCT.md`, `DATA_BASE_CONTEXT.md` and `DESIGN_SYSTEM.md` are in Portuguese; keep them in Portuguese when editing.

## Source of truth (read before coding)

1. `docs/ARCHITECTURE.md` — decision log (D-01…D-17), process model, layers, security. **Start here.**
2. `docs/DATA_BASE_CONTEXT.md` — schema, integrity rules, sync rules.
3. `docs/PRODUCT.md` — MVP scope and acceptance criteria.
4. `docs/DESIGN_SYSTEM.md` and `design/` — visual tokens and mockups.
5. `docs/ROADMAP.md` — phases and acceptance criteria.

If code and docs disagree, stop and ask. When a decision changes, update the docs **in the same commit**. Never invent tables, columns, `origin` values, art types or decisions that are not in the docs; propose them first.

## Current status and scope of work

- Phases 0 and 1 are complete (Phase 1 spike results: `docs/ARCHITECTURE.md` §3.1). **Work only on the phase the owner names** (next: Phase 2 — database and domain). Do not start the next phase on your own.
- Before non-trivial work, propose a short plan and wait for approval.
- Open decisions: D-13 (installer, Phase 8), where to persist preferences, whether `yuzu` is wanted, whether interrupted sessions add time (default: no). If a task depends on an open item, ask instead of deciding.

## Stack and tooling (accepted)

- npm (commit the lockfile); pin Node and Electron versions.
- electron-vite (separate main / preload / renderer builds); strict TypeScript.
- Vitest for tests; ESLint (flat config) + Prettier.
- SQLite via `better-sqlite3`, hand-written SQL in repositories, no ORM, versioned `.sql` migrations tracked with `PRAGMA user_version`.
- Scripts: `npm run dev`, `npm run build`, `npm start` (preview build), `npm test` (Vitest, run once), `npm run lint`, `npm run typecheck`, `npm run format`. Node 24.18.0 (`.nvmrc`), Electron 44.10.1 (exact).
- If Electron fails with `electron.app` undefined, `ELECTRON_RUN_AS_NODE=1` is set in the shell (VS Code sets it); unset it for `dev`/`start`.
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
- `playtime` (minutes) = `floor(sum of completed session seconds / 60)`, recomputed in the same transaction that closes the session. Never negative.
- Related writes (session + playtime, achievements + counters) happen in **one transaction**. Repeated syncs with the same data change nothing.
- `tier` and platinum are pure domain functions; trophy counters are recomputed from `ACHIEVEMENTS`, never incremented blindly. Unknown `global_percent` is `NULL`, never `0`.
- Metadata (`appdetails`) is fetched **only on discovery/add**, `metadata_fetched_at` is set only after a valid response, and failures are retried on later refreshes.

## Steam rules

- Discovery: Windows registry `SteamPath` (fallback + user override) → `libraryfolders.vdf` → `appmanifest_*.acf` → `StateFlags`. Ignore non-game manifests. Pin behavior with fixtures; the flags are not an official contract.
- Launch: `steam://rungameid/<appid>`, built in main from a validated numeric App ID taken from the DB, never from renderer strings. A launch counts as started only when `AppRunning` is observed (with timeout); a session starts then.
- Offer Play only when `installed = 1`.
- Achievements: sync only the game that just closed, plus a manual full sync. Never periodic or automatic full-library sync. Validate current Steam Web API formats before implementing.

## Security

- API keys (Steam, SteamGridDB) are encrypted with Electron `safeStorage`, decrypted only in main, never sent to the renderer, never logged. Never log URLs containing keys.
- Executable paths, arguments and working directories are **untrusted**: validate, pass arguments as an array, never use a shell or build command strings.
- Only open external URLs built in main from an allowlist.
- Never commit secrets, databases or artwork cache.

## Artwork

- Five kinds: `cover_square` (Library), `cover_portrait` 600×900 (Home), `logo`, `background` 1920×1080 (Game details), `header` (Achievements list).
- Sources: Steam `appdetails`, SteamGridDB (user's own key), local files. **No Google Images or scraping.**
- Fetch lazily through a throttled queue, validate downloads (type, size, decoded dimensions), cache on disk, never hotlink at runtime. The app must work with placeholders and without a SteamGridDB key.

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