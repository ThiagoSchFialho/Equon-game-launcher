import type { Result } from '../../shared/ipc/contract'

const FADE_MS = 600
const FADE_STEP_MS = 16
/** The game's window stays covered this long after it appears (owner decision). */
const AFTER_GAME_WINDOW_MS = 3000
/** The whole screen is covered, so it must always leave (owner decision). */
const TIME_LIMIT_MS = 60_000
/** Process start times are not exact, and a game may start just before the launch returns. */
const START_MARGIN_MS = 1000

/** A game's window is at least this share of the monitor, each way, even when windowed. */
const MIN_GAME_WINDOW_SHARE = 0.5

/**
 * Never the game: nothing in front, the Windows shell, the Steam client and the launchers of other
 * stores, which may open a large window of their own before the game.
 */
const NOT_A_GAME =
  /^(Idle|explorer|SearchHost|ShellExperienceHost|StartMenuExperienceHost|TextInputHost|LockApp|ApplicationFrameHost|powershell|steam|steamwebhelper|upc|UbisoftConnect|EADesktop|EABackgroundService|Origin|EpicGamesLauncher|EpicWebHelper|Battle\.net|GalaxyClient|LauncherPatcher|RockstarService)$/i

export interface ForegroundWindow {
  pid: number
  process: string | null
  /** Milliseconds; null when Windows does not tell, as for a program run as administrator. */
  startedAt: number | null
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/**
 * A program already open is not the game, even if it comes to the front: only a process started
 * after the launch counts (measured on 2026-11-07: VS Code took the foreground while covered).
 * Nor is a small window: games open an anti-cheat or splash window first (measured: Fortnite
 * 800×450, Forza Horizon 6 311×151).
 */
export function isGameWindow(
  window: ForegroundWindow,
  launchedAt: number,
  ownPid: number,
  monitor: Size
): boolean {
  if (window.pid === 0 || window.pid === ownPid) return false
  if (NOT_A_GAME.test(window.process ?? '')) return false
  if (
    window.width < monitor.width * MIN_GAME_WINDOW_SHARE ||
    window.height < monitor.height * MIN_GAME_WINDOW_SHARE
  ) {
    return false
  }
  return window.startedAt === null || window.startedAt >= launchedAt - START_MARGIN_MS
}

export interface CoverWindow {
  /** The monitor it covers. */
  monitor: Size
  show(): void
  setOpacity(opacity: number): void
  close(): void
}

export interface LaunchCoverDeps {
  /** Hidden and transparent until shown. */
  open(gameId: number): Promise<CoverWindow>
  watch(onWindow: (window: ForegroundWindow) => void): { stop(): void }
  reducedMotion(): boolean
  ownPid: number
  now(): number
  /** The launcher ignores input while covered: the only thing the user can do is cancel. */
  onChanged(active: boolean): void
  onError?(error: unknown): void
}

export interface LaunchCover {
  /** Covers the screen, starts the game only once covered, and leaves when its window appears. */
  run(gameId: number, launch: () => Promise<Result<null>>): Promise<Result<null>>
  /** Leaves now; a game already started goes on. */
  cancel(): void
  /** The app is closing. */
  dispose(): void
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The image that covers the screen while a game opens (ARCHITECTURE.md §3.21, D-22). */
export function createLaunchCover(deps: LaunchCoverDeps): LaunchCover {
  let leave: ((options?: { instantly?: boolean }) => void) | null = null

  return {
    async run(gameId, launch) {
      if (leave) return launch()
      let cover: CoverWindow
      try {
        cover = await deps.open(gameId)
      } catch (error) {
        // A cover that cannot open must never stop the game.
        deps.onError?.(error)
        return launch()
      }

      let opacity = 0
      let left = false
      let launchedAt: number | null = null
      let gameSeen = false
      let afterGameWindow: ReturnType<typeof setTimeout> | undefined

      const fade = async (to: number, keepGoing: () => boolean): Promise<void> => {
        if (deps.reducedMotion()) {
          opacity = to
          cover.setOpacity(to)
          return
        }
        const from = opacity
        const start = deps.now()
        for (;;) {
          if (!keepGoing()) return
          const progress = Math.min(1, (deps.now() - start) / FADE_MS)
          opacity = from + (to - from) * progress
          cover.setOpacity(opacity)
          if (progress === 1) return
          await wait(FADE_STEP_MS)
        }
      }

      const watch = deps.watch((window) => {
        if (launchedAt === null || gameSeen || left) return
        if (!isGameWindow(window, launchedAt, deps.ownPid, cover.monitor)) return
        gameSeen = true
        afterGameWindow = setTimeout(() => finish(), AFTER_GAME_WINDOW_MS)
      })
      const timeLimit = setTimeout(() => finish(), TIME_LIMIT_MS)

      const finish = (options: { instantly?: boolean } = {}): void => {
        if (left) return
        left = true
        leave = null
        clearTimeout(timeLimit)
        clearTimeout(afterGameWindow)
        watch.stop()
        deps.onChanged(false)
        if (options.instantly) {
          cover.close()
          return
        }
        void fade(0, () => true).finally(() => cover.close())
      }

      leave = finish
      deps.onChanged(true)
      cover.show()
      await fade(1, () => !left)
      // Cancelled before it was covered: the game was never started.
      if (left) return { ok: true, data: null }

      launchedAt = deps.now()
      let result: Result<null>
      try {
        result = await launch()
      } catch (error) {
        finish()
        throw error
      }
      // Failed: the error is on the page, under the cover.
      if (!result.ok) finish()
      return result
    },

    cancel() {
      leave?.()
    },

    dispose() {
      leave?.({ instantly: true })
    }
  }
}
