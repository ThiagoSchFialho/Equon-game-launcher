import type { Result } from '../../shared/ipc/contract'

/** The window and processes behind a port, so tests never touch them. */
export interface SystemControlDeps {
  window(): { isFullScreen(): boolean; setFullScreen(fullscreen: boolean): void } | null
  /** Runs a fixed program with a fixed argument list, never through a shell. */
  run(file: string, args: readonly string[]): Promise<void>
  quit(): void
  /** %SystemRoot%; the program path never comes from the renderer. */
  systemRoot: string | undefined
}

export interface SystemControl {
  isFullscreen(): boolean
  /** Returns the new state. */
  toggleFullscreen(): boolean
  shutdown(): Promise<Result<null>>
  quit(): void
}

/**
 * The system menu (D-21). `/t 0` does not force anything: Windows may still ask about
 * a program with unsaved work, which any delay above zero would close by force.
 */
export function createSystemControl(deps: SystemControlDeps): SystemControl {
  const isFullscreen = (): boolean => deps.window()?.isFullScreen() ?? false
  return {
    isFullscreen,

    toggleFullscreen() {
      const next = !isFullscreen()
      deps.window()?.setFullScreen(next)
      return next
    },

    async shutdown() {
      const root = deps.systemRoot ?? 'C:\\Windows'
      try {
        await deps.run(`${root}\\System32\\shutdown.exe`, ['/s', '/t', '0'])
        return { ok: true, data: null }
      } catch {
        return { ok: false, error: { code: 'shutdown-failed' } }
      }
    },

    quit: deps.quit
  }
}
