import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import type { ProcessLauncher, RunningProcess } from '../../core/application'

/**
 * Starts a game executable directly: no shell, arguments as an array, the
 * validated working directory (or the executable's folder) as cwd
 * (ARCHITECTURE.md §7). Resolves once the OS reports the process started.
 */
export function createProcessLauncher(): ProcessLauncher {
  return {
    launch: (config) =>
      new Promise<RunningProcess>((resolve, reject) => {
        const child = spawn(config.executablePath, config.arguments, {
          cwd: config.workingDirectory ?? dirname(config.executablePath),
          shell: false,
          stdio: 'ignore',
          windowsHide: false
        })
        const exited = new Promise<void>((done) => child.once('exit', () => done()))
        child.once('error', reject)
        child.once('spawn', () => {
          child.removeListener('error', reject)
          // A later error (e.g. while exiting) must not crash the launcher.
          child.on('error', () => {})
          resolve({ pid: child.pid ?? -1, exited })
        })
      })
  }
}
