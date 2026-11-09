import { useEffect, useState } from 'react'
import type { BrowserListing, PickKind } from '../../../shared/ipc/contract'
import { useFocusManager, useFocusable } from '../focus/focus-context'
import { t } from '../strings'
import { DialogFrame } from './Dialog'
import './FileBrowserDialog.css'

type Loaded =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; listing: BrowserListing }

function Row({
  id,
  label,
  ariaLabel,
  kind,
  primary,
  autoFocus,
  onConfirm
}: {
  id: string
  label: string
  /** When the visible label is not a name (the "..." row). */
  ariaLabel?: string
  /** `parent`: the "..." entry that goes up one folder. */
  kind: 'directory' | 'file' | 'parent' | 'action'
  /** The main action, in the accent color. */
  primary?: boolean
  autoFocus?: boolean
  onConfirm: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    onConfirm,
    autoFocus
  })
  return (
    <button
      ref={setElement}
      className={`file-row file-row--${kind}`}
      data-focused={focused}
      data-primary={primary}
      aria-label={ariaLabel}
      tabIndex={-1}
      {...mouse}
    >
      {/* Buttons start with their text; list entries keep the icon column aligned. */}
      {kind !== 'action' && (
        <span className="file-row__icon" aria-hidden>
          {kind === 'directory' ? '▸' : kind === 'file' ? '•' : ''}
        </span>
      )}
      <span className="file-row__label">{label}</span>
    </button>
  )
}

/**
 * Controller-friendly file browser (ARCHITECTURE.md §3.13). Main lists only
 * folders and files allowed for `kind`; the chosen path is validated again
 * when saving. Back, or the "..." entry at the top of a folder, goes to the parent folder;
 * back on the start list closes.
 */
export function FileBrowserDialog({
  kind,
  initialPath,
  onPick,
  onClose
}: {
  kind: PickKind
  initialPath?: string | null
  onPick: (path: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [path, setPath] = useState<string | null>(initialPath ?? null)
  const [cameFrom, setCameFrom] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    window.equon.files.list(path, kind).then(
      (result) => {
        if (cancelled) return
        setLoaded(result.ok ? { status: 'ready', listing: result.data } : { status: 'error' })
      },
      () => !cancelled && setLoaded({ status: 'error' })
    )
    return () => {
      cancelled = true
    }
  }, [path, kind])

  const open = (next: string | null): void => {
    setCameFrom(path)
    setLoaded({ status: 'loading' })
    setPath(next)
  }
  const up = (): void => {
    if (path === null) onClose()
    else open(loaded.status === 'ready' ? loaded.listing.parent : null)
  }
  const native = (): void => {
    void window.equon.files.pickNative(kind).then((picked) => picked && onPick(picked))
  }

  const entries = loaded.status === 'ready' ? loaded.listing.entries : []
  // Inside a folder the list starts with "..." (owner decision), so that is the first item.
  const hasParent = path !== null && loaded.status !== 'loading'
  const cameFromIndex = entries.findIndex((e) => e.path === cameFrom)
  const focusTarget =
    cameFromIndex >= 0
      ? `files:entry:${entries[cameFromIndex].path}`
      : hasParent
        ? 'files:parent'
        : entries[0] && `files:entry:${entries[0].path}`

  // The list arrives after the action buttons, so focus it explicitly once loaded.
  const focus = useFocusManager()
  useEffect(() => {
    if (focusTarget) focus.focus(focusTarget)
  }, [focus, focusTarget])

  return (
    // A new scope per folder so focus starts on its first entry (or the folder we came from).
    <DialogFrame
      id={`files:${path ?? 'start'}`}
      title={t.files.titles[kind]}
      onClose={onClose}
      actions={{ back: up }}
      width="wide"
    >
      <h2 className="dialog__title">{t.files.titles[kind]}</h2>
      <div className="dialog__panel file-browser">
        <p className="file-browser__path">{path ?? t.files.start}</p>
        <div className="file-browser__actions">
          {kind === 'directory' && path !== null && (
            <Row
              id="files:this"
              label={t.files.useThisFolder}
              kind="action"
              primary
              onConfirm={() => onPick(path)}
            />
          )}
          {/* On the right, apart from the choice made in Equon (owner decision). */}
          <span className="file-browser__spacer" />
          <Row id="files:native" label={t.files.native} kind="action" onConfirm={native} />
        </div>
        <div className="file-browser__list">
          {loaded.status === 'loading' && <p className="file-browser__note">{t.files.loading}</p>}
          {loaded.status === 'error' && (
            <p className="file-browser__note file-browser__note--error">{t.files.error}</p>
          )}
          {hasParent && (
            <Row
              id="files:parent"
              label={t.files.parent}
              ariaLabel={t.files.up}
              kind="parent"
              autoFocus={cameFromIndex < 0}
              onConfirm={up}
            />
          )}
          {loaded.status === 'ready' && entries.length === 0 && (
            <p className="file-browser__note">{t.files.empty}</p>
          )}
          {entries.map((entry, i) => (
            <Row
              key={entry.path}
              id={`files:entry:${entry.path}`}
              label={entry.name}
              kind={entry.type}
              autoFocus={cameFromIndex >= 0 ? i === cameFromIndex : !hasParent && i === 0}
              onConfirm={() => (entry.type === 'directory' ? open(entry.path) : onPick(entry.path))}
            />
          ))}
          {loaded.status === 'ready' && loaded.listing.truncated && (
            <p className="file-browser__note">{t.files.truncated}</p>
          )}
        </div>
      </div>
    </DialogFrame>
  )
}
