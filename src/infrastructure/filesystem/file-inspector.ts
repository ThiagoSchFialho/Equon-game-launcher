import { statSync } from 'node:fs'
import type { FileInspector } from '../../core/application'

/** Only ENOENT/ENOTDIR mean "missing"; any other failure is "unreadable" (never treated as absent). */
export function createFileInspector(): FileInspector {
  return {
    stateOf(path) {
      try {
        const stats = statSync(path)
        if (stats.isFile()) return 'file'
        if (stats.isDirectory()) return 'directory'
        return 'unreadable'
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unreadable'
      }
    }
  }
}
