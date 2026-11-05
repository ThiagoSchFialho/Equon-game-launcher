# Equon Game Launcher

A controller-first PC game launcher designed to bring your game library together in one place, delivering a console-like experience on PC.

## About

Equon is a desktop application for Windows focused on simplifying how players organize, browse, and launch their games.

Inspired by the convenience of console interfaces, Equon aims to provide a unified gaming library with a distinctive visual identity, intuitive controller navigation, and useful information about each game.

The project is currently under development.

## Goals

- **Unified Library:** Bring games from different platforms and local installations into one organized collection.
- **Controller-First Experience:** Navigate the interface and launch games using a gamepad, without relying on a mouse or keyboard.
- **Game Tracking:** Track playtime and recent gaming activity.
- **Achievement Integration:** Synchronize and display Steam achievements when supported.
- **Personalization:** Organize the library with favorites, hidden games, and completion status.
- **Performance:** Deliver a responsive interface with efficient asset loading and reliable local data storage.

## Planned Features

- Steam game library integration (local installs, launch, and installation status).
- Manually added games. This is how games from the Epic Games Store, GOG, or any other launcher are added; there is no automatic Epic or GOG integration.
- Origins for emulated games (built-in Yuzu and PlayStation 2), plus origins you create yourself, such as Nintendo 64 for a new emulator.
- Game details, artwork (via Steam, SteamGridDB, or local files), and metadata.
- Playtime tracking.
- Steam achievement synchronization.
- Search, filtering, and sorting.
- Game installation status detection.
- Gamepad navigation and keyboard/mouse support.
- Local persistence for game data and preferences.

Features will be implemented progressively, and availability may vary depending on the game source and its supported integrations.

## Design Philosophy

Equon follows a hybrid visual direction that combines large game artwork, editorial organization, and subtle retro-gaming influences.

The interface is designed primarily for conventional 16:9 displays, including setups connected to a television, with readability at a distance and consistent controller focus as key priorities.

Design on Figma: https://www.figma.com/design/DIkoemv1pnAg8px8TZchNG/Untitled?node-id=0-1&p=f&t=4hBnYoyVth7OYjoR-0

## Platform

- **Initial target:** Windows
- **Primary input:** Game controller
- **Additional input:** Mouse and keyboard

## Tech Stack

Recorded in `docs/ARCHITECTURE.md`. Phases 1–7 are implemented (skeleton, database, controller UI, manual games, library organization, Steam library and metadata, achievements); hardening and release preparation come next.

- **Desktop:** Electron, React, and TypeScript, built with electron-vite.
- **Local database:** SQLite (embedded, no separate server) via `better-sqlite3`.
- **Tooling:** npm, Vitest, ESLint, and Prettier.

## Local Setup

Requirements: Windows, Node.js **24.18.0** (see `.nvmrc`) and npm. No C++ toolchain is needed.

```sh
npm install      # installs dependencies and downloads the pinned Electron (44.10.1)
npm run dev      # starts the app with hot reload
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the app in development mode |
| `npm run dev:seed` | Same, after replacing the dev library with ~40 sample games and generated artwork |
| `npm run build` | Typecheck and build main, preload and renderer into `out/` |
| `npm start` | Preview the production build |
| `npm test` | Run the Vitest suite once |
| `npm run lint` | ESLint, including the layer-boundary rules |
| `npm run typecheck` | `tsc --noEmit` for the Node and web projects |
| `npm run format` | Prettier |

Packaging (`build:unpack`, `build:win`) exists but the installer is not decided yet (D-13).

### Native module (`better-sqlite3`)

`better-sqlite3` 13 ships N-API prebuilt binaries, so the same binary works in Node (tests) and Electron (app) and **no rebuild is needed**. `tests/native/better-sqlite3.test.ts` checks both runtimes. If it ever fails with a load or `NODE_MODULE_VERSION` error, the package stopped shipping compatible prebuilds; that is a tooling problem, not a code bug (see `docs/ARCHITECTURE.md` §3.15).

### Manual games

Library → "Adicionar jogo": pick the game's `.exe` or a store `.url` shortcut, optional arguments, working folder and a 1920×1080 background. The launcher starts the executable directly and adds the time of each observed session to the game. Executables that hand off to another launcher and exit right away are not tracked, and `.url` shortcuts are never tracked (see `docs/ARCHITECTURE.md` §11).

Library → "Adicionar emulador": configure `yuzu.exe` once; Yuzu games then only need the ROM.

### Installing

`npm run build:win` creates `dist/equon-game-launcher-<version>-setup.exe`. Run it: it installs for the current user, with no administrator rights, and creates the shortcuts. To update, run the new installer over the old one.

The installer is not signed: Windows SmartScreen may warn about it ("More info" → "Run anyway"), and an antivirus may hold the new program for a scan, so the first launch can take a while.

Your library stays in `%APPDATA%\equon-game-launcher`. Installing, updating and uninstalling never touch it. To recover from a backup, see `docs/DATA_BASE_CONTEXT.md` §6.

### Development data

Unpackaged runs (`npm run dev`, `npm start`) keep their data in `%APPDATA%\equon-game-launcher-dev`, separate from the real library (`%APPDATA%\equon-game-launcher`, used by the packaged app). `npm run dev:seed` only ever writes to the dev folder.

### Controls

Controller (Xbox layout): A confirm, B back, D-pad / left stick move, right stick scroll, LB/RB switch section, ☰ options. Keyboard: arrows, Enter/Space, Esc/Backspace, Page Up/Down, Q/E, M. Mouse: click to open, right click for options. Full table in `docs/DESIGN_SYSTEM.md` §8.

### Troubleshooting

- **`Cannot read properties of undefined (reading 'isPackaged')` on `npm run dev`:** the terminal has `ELECTRON_RUN_AS_NODE=1` set (VS Code's integrated terminal can set it). Clear it for the session: `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell, or `unset ELECTRON_RUN_AS_NODE` in Git Bash.

## Documentation

- [`docs/PRODUCT.md`](docs/PRODUCT.md): product requirements and MVP scope.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): architecture and decision log.
- [`docs/DATA_BASE_CONTEXT.md`](docs/DATA_BASE_CONTEXT.md): data model and integrity rules.
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md): visual design system.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): implementation phases.
