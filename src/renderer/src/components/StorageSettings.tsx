import { useCallback, useEffect, useState } from 'react'
import type { DriveInfo, GameSizeInfo } from '../../../shared/ipc/contract'
import { formatBytes } from '../data/format'
import { t } from '../strings'
import { Button } from './Button'
import { ChoiceDialog } from './Dialog'
import { StateMessage } from './StateMessage'

/** Under this share free, the free space reads in red, as Windows warns. */
const LOW_SPACE_SHARE = 0.1
/** Games with a colour of their own on each drive's bar (owner decision, D-34). */
const COLOURED_GAMES = 9

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; drives: DriveInfo[] }

/**
 * Settings › Armazenamento: each drive, read each time the tab opens, with how much each
 * installed game takes on it (D-34). Steam games and ROMs come at once; game folders are summed
 * one at a time afterwards, and leaving the tab stops asking for more.
 */
export function StorageSettings(): React.JSX.Element {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [sizes, setSizes] = useState<GameSizeInfo[]>([])
  const read = useCallback(() => {
    window.equon.app.listDrives().then(
      (result) =>
        setState(result.ok ? { status: 'ready', drives: result.data } : { status: 'error' }),
      () => setState({ status: 'error' })
    )
  }, [])
  useEffect(read, [read])

  useEffect(() => {
    let cancelled = false
    const replace = (entry: GameSizeInfo): void =>
      setSizes((all) => all.map((other) => (other.gameId === entry.gameId ? entry : other)))
    void (async () => {
      let list: GameSizeInfo[]
      try {
        list = await window.equon.app.gameSizes()
      } catch {
        return
      }
      if (cancelled) return
      setSizes(list)
      for (const entry of list.filter((game) => game.kind === 'pending')) {
        if (cancelled) return
        try {
          const summed = await window.equon.app.gameFolderSize(entry.gameId)
          if (!cancelled && summed) replace(summed)
        } catch {
          if (!cancelled) replace({ ...entry, kind: 'unknown' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const retry = (): void => {
    setState({ status: 'loading' })
    read()
  }

  if (state.status === 'loading') return <StateMessage message={t.settings.storage.loading} />
  if (state.status === 'error') {
    return (
      <StateMessage
        tone="error"
        message={t.settings.storage.error}
        action={{ id: 'settings:storage-retry', label: t.library.retry, onConfirm: retry }}
      />
    )
  }
  if (state.drives.length === 0) return <StateMessage message={t.settings.storage.empty} />
  return (
    <ul className="settings__drives">
      {state.drives.map((drive) => (
        <Drive
          key={drive.letter}
          drive={drive}
          games={sizes.filter((game) => game.drive === drive.letter)}
        />
      ))}
    </ul>
  )
}

/** A game's size as words: exact, "aprox." for a summed folder, "mais de" when it stopped. */
function sizeText(game: GameSizeInfo): string {
  if (game.kind === 'pending') return t.settings.storage.calculating
  if (game.bytes === null) return t.settings.storage.unknown
  const size = formatBytes(game.bytes)
  if (game.truncated) return t.settings.storage.atLeast(size)
  return game.kind === 'approx' ? t.settings.storage.approx(size) : size
}

interface Segment {
  id: string
  label: string
  bytes: number
  /** CSS colour: a chart token, or a neutral. */
  colour: string
}

function Drive({ drive, games }: { drive: DriveInfo; games: GameSizeInfo[] }): React.JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const name =
    drive.label ?? (drive.removable ? t.settings.storage.removable : t.settings.storage.local)
  const used = drive.totalBytes - drive.freeBytes
  const sized = games
    .filter((game) => game.bytes !== null && game.kind !== 'pending')
    .sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))
  // Games in one folder share its bytes: on the drive they count once.
  const counted = sized.filter(
    (game, i) =>
      !game.shared || sized.findIndex((other) => other.shared && other.bytes === game.bytes) === i
  )
  const gamesBytes = Math.min(
    used,
    counted.reduce((sum, game) => sum + (game.bytes ?? 0), 0)
  )
  const coloured = counted.slice(0, COLOURED_GAMES)
  const rest = counted.slice(COLOURED_GAMES)
  const restBytes = rest.reduce((sum, game) => sum + (game.bytes ?? 0), 0)

  const segments: Segment[] = [
    ...coloured.map((game, i) => ({
      id: `game-${game.gameId}`,
      label: game.title,
      bytes: game.bytes ?? 0,
      colour: `var(--color-chart-${i + 1})`
    })),
    ...(restBytes > 0
      ? [
          {
            id: 'other-games',
            label: t.settings.storage.otherGames(rest.length),
            bytes: restBytes,
            colour: 'var(--color-chart-other)'
          }
        ]
      : []),
    {
      id: 'other-files',
      label: t.settings.storage.otherFiles,
      bytes: Math.max(0, used - gamesBytes),
      colour: 'var(--color-chart-rest)'
    }
  ]
  const share = (bytes: number): string => `${(bytes / drive.totalBytes) * 100}%`
  const low = drive.freeBytes / drive.totalBytes < LOW_SPACE_SHARE
  const legend = [
    ...coloured.map((game, i) => ({
      id: `game-${game.gameId}`,
      label: game.title,
      value: sizeText(game),
      colour: `var(--color-chart-${i + 1})`
    })),
    ...segments
      .filter((segment) => !segment.id.startsWith('game-'))
      .map((segment) => ({ ...segment, value: formatBytes(segment.bytes) }))
  ]

  return (
    <li className="settings__drive">
      <div className="settings__drive-head">
        <p className="settings__drive-name">
          {name} ({drive.letter})
        </p>
        {games.length > 0 && (
          <p className="settings__drive-games">
            {t.settings.storage.gamesTotal(formatBytes(gamesBytes))}
          </p>
        )}
      </div>
      <div
        className="settings__drive-bar"
        role="img"
        aria-label={`${name}: ${legend.map((item) => `${item.label} ${item.value}`).join(', ')}`}
      >
        {segments
          .filter((segment) => segment.bytes > 0)
          .map((segment) => (
            <span
              key={segment.id}
              className="settings__drive-segment"
              style={{ width: share(segment.bytes), background: segment.colour }}
            />
          ))}
        <span className="settings__drive-free" style={{ width: share(drive.freeBytes) }} />
      </div>
      <ul className="settings__drive-legend">
        {legend.map((item) => (
          <li key={item.id}>
            <span className="settings__drive-dot" style={{ background: item.colour }} />
            <span className="settings__drive-label">{item.label}</span>
            <span className="settings__drive-value">{item.value}</span>
          </li>
        ))}
        <li>
          <span className="settings__drive-dot settings__drive-dot--free" />
          <span className="settings__drive-label">{t.settings.storage.free}</span>
          <span className="settings__drive-value" data-low={low}>
            {t.settings.storage.space(formatBytes(drive.freeBytes), formatBytes(drive.totalBytes))}
          </span>
        </li>
      </ul>
      {games.length > 0 && (
        <Button
          id={`settings:storage-all:${drive.letter}`}
          label={t.settings.storage.seeAll}
          onConfirm={() => setShowAll(true)}
        >
          {t.settings.storage.seeAll}
        </Button>
      )}
      {showAll && (
        <ChoiceDialog
          id={`storage-all-${drive.letter}`}
          title={t.settings.storage.allTitle(`${name} (${drive.letter})`)}
          width="wide"
          onClose={() => setShowAll(false)}
          items={[
            ...[...games]
              .sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1))
              .map((game) => ({
                id: `game-${game.gameId}`,
                label: game.title,
                detail: game.shared
                  ? `${sizeText(game)} · ${t.settings.storage.shared}`
                  : sizeText(game),
                onConfirm: () => setShowAll(false)
              })),
            {
              id: 'close',
              label: t.settings.storage.close,
              separated: true,
              onConfirm: () => setShowAll(false)
            }
          ]}
        />
      )}
    </li>
  )
}
