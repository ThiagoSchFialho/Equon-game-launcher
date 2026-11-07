import { useCallback, useEffect, useState } from 'react'
import type { DriveInfo } from '../../../shared/ipc/contract'
import { formatBytes } from '../data/format'
import { t } from '../strings'
import { StateMessage } from './StateMessage'

/** Under this share free, the bar turns red, as Windows does. */
const LOW_SPACE_SHARE = 0.1

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; drives: DriveInfo[] }

/** Settings › Armazenamento: read each time the tab opens, so it is never out of date. */
export function StorageSettings(): React.JSX.Element {
  const [state, setState] = useState<State>({ status: 'loading' })
  const read = useCallback(() => {
    window.equon.app.listDrives().then(
      (result) =>
        setState(result.ok ? { status: 'ready', drives: result.data } : { status: 'error' }),
      () => setState({ status: 'error' })
    )
  }, [])
  useEffect(read, [read])
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
        <Drive key={drive.letter} drive={drive} />
      ))}
    </ul>
  )
}

function Drive({ drive }: { drive: DriveInfo }): React.JSX.Element {
  const usedShare = (drive.totalBytes - drive.freeBytes) / drive.totalBytes
  const name =
    drive.label ?? (drive.removable ? t.settings.storage.removable : t.settings.storage.local)
  return (
    <li className="settings__drive">
      <p className="settings__drive-name">
        {name} ({drive.letter})
      </p>
      <div
        className="settings__drive-bar"
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(usedShare * 100)}
      >
        <div
          className="settings__drive-used"
          data-low={drive.freeBytes / drive.totalBytes < LOW_SPACE_SHARE}
          style={{ transform: `scaleX(${usedShare})` }}
        />
      </div>
      <p className="settings__drive-space">
        {t.settings.storage.space(formatBytes(drive.freeBytes), formatBytes(drive.totalBytes))}
      </p>
    </li>
  )
}
