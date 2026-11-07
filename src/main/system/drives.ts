import { execFile } from 'child_process'
import { z } from 'zod'
import type { DriveInfo, Result } from '../../shared/ipc/contract'

/** Fixed text, with nothing from outside in it. It only reads. */
const SCRIPT =
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8; ' +
  'ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_LogicalDisk | ForEach-Object { ' +
  '@{ letter = $_.DeviceID; label = $_.VolumeName; type = $_.DriveType; size = $_.Size; free = $_.FreeSpace } })'

const TIMEOUT_MS = 15_000
/** Win32_LogicalDisk.DriveType. Network drives are left out: they may hang or not be disks here. */
const REMOVABLE = 2
const LOCAL = 3

const rowsSchema = z.array(
  z.object({
    letter: z.string().regex(/^[A-Z]:$/),
    label: z.string().nullable().optional(),
    type: z.number(),
    size: z.number().nonnegative().nullable().optional(),
    free: z.number().nonnegative().nullable().optional()
  })
)

/** Null when it is not what the script prints. An empty card reader has no size, so it is left out. */
export function parseDrives(output: string): DriveInfo[] | null {
  let json: unknown
  try {
    json = JSON.parse(output.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
  const rows = rowsSchema.safeParse(json)
  if (!rows.success) return null
  const drives: DriveInfo[] = []
  for (const row of rows.data) {
    if ((row.type !== LOCAL && row.type !== REMOVABLE) || !row.size) continue
    drives.push({
      letter: row.letter,
      label: row.label?.trim() || null,
      removable: row.type === REMOVABLE,
      totalBytes: row.size,
      freeBytes: Math.min(row.free ?? 0, row.size)
    })
  }
  return drives.sort((a, b) => a.letter.localeCompare(b.letter))
}

/** Settings › Armazenamento: a fixed program with a fixed script, with no shell. */
export function listDrives(systemRoot: string | undefined): Promise<Result<DriveInfo[]>> {
  const root = systemRoot ?? 'C:\\Windows'
  return new Promise((resolve) => {
    execFile(
      `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
      { windowsHide: true, timeout: TIMEOUT_MS, encoding: 'utf8' },
      (error, stdout) => {
        const drives = error ? null : parseDrives(stdout)
        resolve(
          drives ? { ok: true, data: drives } : { ok: false, error: { code: 'drives-failed' } }
        )
      }
    )
  })
}
