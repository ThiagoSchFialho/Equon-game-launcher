import { useEffect, useState } from 'react'
import type { BrowserListing, PickKind } from '../../../shared/ipc/contract'
import { useFocusManager, useFocusable } from '../focus/focus-context'
import { t } from '../strings'
import { DialogFrame } from './Dialog'
import './FileBrowserDialog.css'

type Loaded =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; listing: BrowserListing }

/** Previews asked of main at the same time; the rest wait their turn. */
const THUMBNAIL_CONCURRENCY = 4

/**
 * Image previews for the browser (owner decision): asked of main only for rows that show, a
 * few at a time, and kept while the dialog is open. undefined = not known yet; null = none.
 */
function useThumbnails(): {
  get(path: string): string | null | undefined
  request(path: string): void
} {
  const [urls, setUrls] = useState<ReadonlyMap<string, string | null>>(new Map())
  // The queue lives outside rendering: one object for the dialog's life, made once.
  const [loader] = useState(() => {
    const asked = new Set<string>()
    const queue: string[] = []
    let active = 0
    let closed = false
    const pump = (): void => {
      while (active < THUMBNAIL_CONCURRENCY && queue.length > 0) {
        const path = queue.shift() as string
        active += 1
        const done = (url: string | null): void => {
          active -= 1
          if (closed) return
          setUrls((all) => new Map(all).set(path, url))
          pump()
        }
        window.equon.files.thumbnail(path).then(done, () => done(null))
      }
    }
    return {
      request(path: string): void {
        if (asked.has(path)) return
        asked.add(path)
        queue.push(path)
        pump()
      },
      // Answers after the dialog closed are dropped; mounted again (React's dev check), kept.
      open(): void {
        closed = false
      },
      close(): void {
        closed = true
      }
    }
  })
  useEffect(() => {
    loader.open()
    return () => loader.close()
  }, [loader])
  return { get: (path) => urls.get(path), request: loader.request }
}

function Row({
  id,
  label,
  ariaLabel,
  kind,
  primary,
  autoFocus,
  thumbnail,
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
  /**
   * Choosing an image: the row starts with a 16:9 preview in place of its icon. `url` is
   * undefined until known; `request` (stable) asks for `path`'s once the row shows.
   */
  thumbnail?: { url: string | null | undefined; path: string; request: (path: string) => void }
  onConfirm: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    onConfirm,
    autoFocus
  })
  const [element, setRowElement] = useState<HTMLButtonElement | null>(null)
  const request = thumbnail?.request
  const previewPath = thumbnail?.path
  // Asked once the row comes into view, so a long folder does not ask for every image.
  useEffect(() => {
    if (!element || !request || !previewPath) return
    if (typeof IntersectionObserver === 'undefined') return request(previewPath)
    const observer = new IntersectionObserver((seen) => {
      if (!seen.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      request(previewPath)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, request, previewPath])
  return (
    <button
      ref={(node) => {
        setElement(node)
        setRowElement(node)
      }}
      className={`file-row file-row--${kind}`}
      data-focused={focused}
      data-primary={primary}
      aria-label={ariaLabel}
      tabIndex={-1}
      {...mouse}
    >
      {/* Buttons start with their text; list entries keep the icon column aligned. */}
      {kind !== 'action' &&
        (thumbnail && kind === 'file' ? (
          // An empty frame until the preview comes, so the row does not move.
          <span className="file-row__thumb" aria-hidden>
            {thumbnail.url && <img src={thumbnail.url} alt="" />}
          </span>
        ) : (
          <span className="file-row__icon" aria-hidden>
            {kind === 'directory' ? '▸' : kind === 'file' ? '•' : ''}
          </span>
        ))}
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
  // Choosing an image: each file shows a small preview (owner decision).
  const thumbnails = useThumbnails()
  const previews = kind === 'image'

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
      <div className="dialog__panel file-browser" data-previews={previews}>
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
              thumbnail={
                previews && entry.type === 'file'
                  ? {
                      url: thumbnails.get(entry.path),
                      path: entry.path,
                      request: thumbnails.request
                    }
                  : undefined
              }
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
