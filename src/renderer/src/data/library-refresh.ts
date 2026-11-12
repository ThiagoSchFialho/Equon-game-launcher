import type { LibraryRefreshInfo } from '../../../shared/ipc/contract'
import { t } from '../strings'

/** "18:02", local time. */
export const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * The last "Atualizar biblioteca" in words: when, and what changed (Settings › Conexões and the
 * Home's quick settings, D-33).
 */
export function refreshText(info: LibraryRefreshInfo | null): string {
  if (info === null) return t.settings.neverRefreshed
  if (info.status === 'failed') {
    return t.settings.refreshFailed[info.reason ?? ''] ?? t.settings.refreshFailedOther
  }
  if (info.status === 'partial') return t.settings.refreshPartial
  return t.settings.refreshResult(clockTime(info.finishedAt), info.added, info.missing)
}
