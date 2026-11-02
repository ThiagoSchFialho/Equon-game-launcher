// Pure text conversions used by the add/edit game form.

/**
 * Splits an argument line into a list: whitespace separates arguments and
 * double quotes group them, e.g. `-fullscreen "D:\ROMs\My Game.iso"`.
 * Backslashes are literal (Windows paths). The result is passed to the
 * process as an array, never through a shell.
 */
export function parseArguments(line: string): string[] {
  const args: string[] = []
  let current = ''
  let inQuotes = false
  let hasToken = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
      hasToken = true
    } else if (/\s/.test(char) && !inQuotes) {
      if (hasToken) args.push(current)
      current = ''
      hasToken = false
    } else {
      current += char
      hasToken = true
    }
  }
  if (hasToken) args.push(current)
  return args
}

/** Inverse of parseArguments for display: arguments with spaces (or empty) are quoted. */
export function formatArguments(args: readonly string[]): string {
  return args.map((arg) => (arg === '' || /\s/.test(arg) ? `"${arg}"` : arg)).join(' ')
}

/** "2004-03-01" → "01-03-2004"; null stays null. */
export function isoToDisplayDate(iso: string | null): string | null {
  const match = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Builds "YYYY-MM-DD", clamping the day to the month's length. */
export function toIsoDate(year: number, month: number, day: number): string {
  const safeDay = Math.min(day, daysInMonth(year, month))
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

export const ROM_PLACEHOLDER = '{rom}'

/**
 * Fills an origin's default emulator arguments with the chosen ROM path
 * (DATA_BASE_CONTEXT.md §3.10): every `{rom}` is replaced; without a
 * placeholder the ROM is appended.
 */
export function applyRomToArguments(template: readonly string[], romPath: string): string[] {
  if (!template.some((arg) => arg.includes(ROM_PLACEHOLDER))) return [...template, romPath]
  return template.map((arg) => arg.split(ROM_PLACEHOLDER).join(romPath))
}
