import { renameSync, rmSync, writeFileSync } from 'node:fs'

/**
 * Writes through a temporary file, so a crash or a full disk can never leave a
 * cut image under the final name, where it would be taken as cached for good.
 */
export function writeFileAtomic(path: string, bytes: Uint8Array): void {
  const temporary = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(temporary, bytes)
    renameSync(temporary, path)
  } catch (error) {
    rmSync(temporary, { force: true })
    throw error
  }
}
