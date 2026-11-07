// Pure presentation helpers (pt-BR).

/** 742 → "12h 22m", 45 → "45m". */
export function formatPlaytime(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** 98.2 → "98%": rounded down, so only a complete game reads 100%. */
export function formatPercent(percent: number): string {
  return `${Math.floor(percent)}%`
}

const MS_PER_DAY = 86_400_000

function localDayNumber(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / MS_PER_DAY)
}

/** "Hoje", "Ontem", "Há 3 dias", "Há 2 meses", "Há 1 ano", counted in local calendar days. */
export function formatLastPlayed(iso: string, now: Date = new Date()): string {
  const days = localDayNumber(now) - localDayNumber(new Date(iso))
  if (!Number.isFinite(days) || days <= 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days < 30) return `Há ${days} dias`
  const months = Math.floor(days / 30)
  if (months < 12) return months === 1 ? 'Há 1 mês' : `Há ${months} meses`
  const years = Math.floor(days / 365)
  return years <= 1 ? 'Há 1 ano' : `Há ${years} anos`
}

/** "2011-04-18" → "2011". */
export function releaseYear(date: string | null): string | null {
  const match = date ? /^(\d{4})/.exec(date) : null
  return match ? match[1] : null
}

export type AgeRatingKey = 'l' | '10' | '12' | '14' | '16' | '18' | 'pendente'

const KNOWN_RATINGS = new Set(['L', '10', '12', '14', '16', '18'])

/** DESIGN_SYSTEM.md §10: known ratings map to their image; anything else is "pendente". */
export function ageRatingKey(requiredAge: string | null): AgeRatingKey {
  const value = requiredAge?.trim().toUpperCase() ?? ''
  if (!KNOWN_RATINGS.has(value)) return 'pendente'
  return value === 'L' ? 'l' : (value as AgeRatingKey)
}

/** Unlock moment in local time, e.g. "20/03/2026 19:35". */
export function formatUnlockDate(iso: string): string {
  const date = new Date(iso)
  const day = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  return `${day} ${formatClock(date)}`
}

/** Clock text, e.g. "19:20". */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
