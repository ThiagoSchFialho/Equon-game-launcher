import { spawn } from 'child_process'
import { z } from 'zod'
import type { ForegroundWindow } from './launch-cover'

/**
 * Fixed text, with nothing from outside in it, so no argument can change what runs. Prints a line
 * each time the window in the foreground changes or is resized, since a splash window may grow into
 * the game. It only reads.
 */
const SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -Namespace Equon -Name Foreground -MemberDefinition '
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr window, out uint processId);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr window, out RECT rect);
public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
'
$last = ''
while ($true) {
  $window = [Equon.Foreground]::GetForegroundWindow()
  $rect = New-Object Equon.Foreground+RECT
  [void][Equon.Foreground]::GetWindowRect($window, [ref]$rect)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $current = "$window $width $height"
  if ($current -ne $last) {
    $last = $current
    $processId = [uint32]0
    [void][Equon.Foreground]::GetWindowThreadProcessId($window, [ref]$processId)
    $info = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $started = $null
    if ($info.StartTime) { $started = $info.StartTime.ToUniversalTime().ToString('o') }
    @{ pid = $processId; process = $info.ProcessName; started = $started; width = $width; height = $height } | ConvertTo-Json -Compress
  }
  Start-Sleep -Milliseconds 250
}
`

const lineSchema = z.object({
  pid: z.number().int().nonnegative(),
  process: z.string().nullable().optional(),
  started: z.string().nullable().optional(),
  width: z.number().int(),
  height: z.number().int()
})

export interface ForegroundWatch {
  stop(): void
}

/** Watches which program is in front. If this fails, the cover only leaves by its time limit. */
export function watchForeground(
  systemRoot: string | undefined,
  onWindow: (window: ForegroundWindow) => void
): ForegroundWatch {
  const root = systemRoot ?? 'C:\\Windows'
  const child = spawn(
    `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
  )
  // Without PowerShell the launcher still works, only without this signal.
  child.on('error', () => {})
  let buffer = ''
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const window = parseForegroundLine(line)
      if (window) onWindow(window)
    }
  })
  return { stop: () => void child.kill() }
}

export function parseForegroundLine(line: string): ForegroundWindow | null {
  let json: unknown
  try {
    json = JSON.parse(line.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
  const parsed = lineSchema.safeParse(json)
  if (!parsed.success) return null
  return {
    pid: parsed.data.pid,
    process: parsed.data.process ?? null,
    startedAt: parsed.data.started ? Date.parse(parsed.data.started) : null,
    width: parsed.data.width,
    height: parsed.data.height
  }
}
