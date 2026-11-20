import { spawn } from 'child_process'

/**
 * Fixed text, with nothing from outside in it: the point comes in two environment variables,
 * read as integers here, so no argument can change what runs. The process declares itself
 * DPI-aware first, so the point is in real pixels on a scaled monitor too.
 */
const SCRIPT = `
Add-Type -Namespace Equon -Name Cursor -MemberDefinition '
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
'
$x = 0
$y = 0
if ([int]::TryParse($env:EQUON_CURSOR_X, [ref]$x) -and [int]::TryParse($env:EQUON_CURSOR_Y, [ref]$y)) {
  [void][Equon.Cursor]::SetProcessDPIAware()
  [void][Equon.Cursor]::SetCursorPos($x, $y)
}
`

export interface ScreenPoint {
  x: number
  y: number
}

/** Only whole numbers within what a screen can be; anything else moves nothing. */
export function isScreenPoint(point: ScreenPoint): boolean {
  const ok = (value: number): boolean => Number.isInteger(value) && Math.abs(value) <= 1_000_000
  return ok(point.x) && ok(point.y)
}

/**
 * Moves the mouse pointer to `point`, in real screen pixels (D-36: out of the game's way while
 * it opens). Best effort: without PowerShell nothing happens and the game goes on.
 */
export function moveCursor(systemRoot: string | undefined, point: ScreenPoint): void {
  if (!isScreenPoint(point)) return
  const root = systemRoot ?? 'C:\\Windows'
  const child = spawn(
    `${root}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    ['-NoProfile', '-NonInteractive', '-Command', SCRIPT],
    {
      windowsHide: true,
      stdio: 'ignore',
      env: { ...process.env, EQUON_CURSOR_X: String(point.x), EQUON_CURSOR_Y: String(point.y) }
    }
  )
  child.on('error', () => {})
}
