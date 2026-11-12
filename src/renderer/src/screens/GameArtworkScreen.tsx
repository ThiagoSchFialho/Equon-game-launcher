import { useEffect, useRef, useState } from 'react'
import {
  artworkUrl,
  draftArtworkUrl,
  gridThumbnailUrl,
  STEAM_GALLERY_KINDS,
  steamChoiceThumbnailUrl,
  type ArtworkDraftInfo,
  type ArtworkEditKind,
  type GameSummary,
  type GridAssetInfo,
  type Result,
  type SteamChoiceInfo,
  type SteamGalleryKind
} from '../../../shared/ipc/contract'
import { currentSection, useNavigation } from '../app/navigation'
import deleteIcon from '../assets/icons/delete.svg'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/Dialog'
import { FileBrowserDialog } from '../components/FileBrowserDialog'
import { Footer, type Hint } from '../components/Footer'
import { GameSearchDialog } from '../components/GameSearchDialog'
import { GridGalleryDialog, type GalleryItem } from '../components/GridGalleryDialog'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { useScreenActions } from '../focus/focus-context'
import { prefersReducedMotion } from '../focus/focus-manager'
import { FocusScope } from '../focus/FocusProvider'
import { errorMessage, t } from '../strings'
import './GameArtworkScreen.css'

/**
 * Offered per kind: IGDB has no square covers, and SteamGridDB's banners are not 16:9.
 * Steam's screenshots and store background only fit 16:9 art, and only for its own games.
 */
const PANELS: readonly { kind: ArtworkEditKind; igdb: boolean; grid: boolean; steam: boolean }[] = [
  { kind: 'cover_portrait', igdb: true, grid: true, steam: false },
  { kind: 'cover_square', igdb: false, grid: true, steam: false },
  { kind: 'logo', igdb: true, grid: true, steam: false },
  { kind: 'background', igdb: true, grid: false, steam: true },
  { kind: 'launch', igdb: true, grid: false, steam: true },
  { kind: 'home', igdb: true, grid: false, steam: true }
]

const isSteamGalleryKind = (kind: ArtworkEditKind): kind is SteamGalleryKind =>
  (STEAM_GALLERY_KINDS as readonly string[]).includes(kind)

type Source = 'file' | 'igdb' | 'grid' | 'steam'
type Change = { type: 'draft'; version: number } | { type: 'removed' }
type Note = { text: string; tone: 'info' | 'error' }

type Overlay =
  | { kind: 'file'; art: ArtworkEditKind }
  | { kind: 'igdb-search'; art: ArtworkEditKind }
  | { kind: 'grid-search'; art: ArtworkEditKind }
  | {
      kind: 'gallery'
      source: 'grid' | 'steam'
      art: ArtworkEditKind
      items: GalleryItem[]
      picking: boolean
      error: string | null
    }
  | { kind: 'discard' }

const HINTS: Hint[] = [
  { button: 'menu', label: t.artEditor.save },
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

const gridItems = (assets: readonly GridAssetInfo[]): GalleryItem[] =>
  assets.map(({ id, width, height }) => {
    const size = `${width}×${height}`
    return {
      id,
      source: gridThumbnailUrl(id),
      label: t.artEditor.galleryItem(size),
      caption: size
    }
  })

const steamItems = (choices: readonly SteamChoiceInfo[]): GalleryItem[] => {
  let shot = 0
  return choices.map(({ id, store }) => {
    const label = store ? t.artEditor.storeBackground : t.artEditor.screenshot(++shot)
    return { id, source: steamChoiceThumbnailUrl(id), label, caption: label }
  })
}

function errorText(source: Source, code: string, kind: ArtworkEditKind): string {
  if (code === 'wrong-proportion') return t.artEditor.proportion[kind]
  if (code === 'download-failed') return t.artEditor.downloadFailed
  if (code === 'no-image') {
    return source === 'grid' ? t.artEditor.noImageGrid : t.artEditor.noImageIgdb
  }
  if (source === 'steam') return t.artEditor.steamErrors[code] ?? t.artEditor.steamErrors.network
  if (source === 'igdb') return t.igdb.errors[code] ?? t.igdb.errors.network
  if (source === 'grid') return t.steamGridDb.errors[code] ?? t.steamGridDb.errors.network
  return errorMessage(code)
}

/** What a kind will show after Salvar: the pending image, the stored one, or none. */
function imageSource(
  game: GameSummary,
  kind: ArtworkEditKind,
  change: Change | undefined
): string | null {
  if (change?.type === 'draft') return draftArtworkUrl(kind, change.version)
  if (!change && game.artwork.includes(kind)) return artworkUrl(game.id, kind, game.artworkVersion)
  return null
}

function Preview({
  kind,
  source
}: {
  kind: ArtworkEditKind
  source: string | null
}): React.JSX.Element {
  return (
    <div className="art-editor__preview" data-kind={kind}>
      {source ? (
        <img className="art-editor__image" src={source} alt="" />
      ) : (
        <svg className="art-editor__empty" viewBox="0 0 272 232" aria-hidden>
          <rect x="6" y="6" width="260" height="220" rx="30" />
          <circle cx="84" cy="74" r="20" />
          <path d="M30 220 L190 92 L262 150" />
        </svg>
      )}
    </div>
  )
}

/** "Editar artes" for any game (ARCHITECTURE.md §3.18): nothing changes until Salvar. */
export function GameArtworkScreen({ id }: { id: number }): React.JSX.Element {
  const navigation = useNavigation()
  const { games } = useGames()
  const [changes, setChanges] = useState<Partial<Record<ArtworkEditKind, Change>>>({})
  const [notes, setNotes] = useState<Partial<Record<ArtworkEditKind, Note>>>({})
  const [busy, setBusy] = useState<ArtworkEditKind | null>(null)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const panels = useRef<Partial<Record<ArtworkEditKind, HTMLElement | null>>>({})

  /** The whole panel comes into view, not only the button: its image is what is being edited. */
  const revealPanel = (kind: ArtworkEditKind): void => {
    panels.current[kind]?.scrollIntoView?.({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    })
  }

  useEffect(() => {
    void window.equon.artworkEdit.begin(id)
    return () => {
      void window.equon.artworkEdit.end()
    }
  }, [id])

  const dirty = Object.keys(changes).length > 0
  const leave = (): void => navigation.back()
  const cancel = (): void => (dirty ? setOverlay({ kind: 'discard' }) : leave())

  const game = games.status === 'ready' ? games.data.find((each) => each.id === id) : undefined
  const isSteam = game?.origin === 'steam'

  const note = (kind: ArtworkEditKind, value: Note | null): void =>
    setNotes((all) => ({ ...all, [kind]: value ?? undefined }))

  /** One image on its way: its panel says so, and the result becomes the preview. */
  const fetchImage = async (
    kind: ArtworkEditKind,
    source: Source,
    task: () => Promise<Result<ArtworkDraftInfo>>
  ): Promise<void> => {
    setBusy(kind)
    note(kind, { text: t.artEditor.downloading, tone: 'info' })
    const result = await task().catch((): Result<ArtworkDraftInfo> => ({
      ok: false,
      error: { code: 'network' }
    }))
    setBusy(null)
    if (result.ok) {
      setChanges((all) => ({ ...all, [kind]: { type: 'draft', version: result.data.version } }))
      note(kind, { text: t.artEditor.pending, tone: 'info' })
    } else if (source === 'igdb' && result.error.code === 'not-found' && isSteam) {
      // IGDB does not link this App ID: the user can still name the game.
      note(kind, null)
      setOverlay({ kind: 'igdb-search', art: kind })
    } else {
      note(kind, { text: errorText(source, result.error.code, kind), tone: 'error' })
    }
  }

  const fromIgdb = (kind: ArtworkEditKind): void => {
    if (isSteam) {
      void fetchImage(kind, 'igdb', () => window.equon.artworkEdit.fromIgdb(id, kind, null))
    } else {
      setOverlay({ kind: 'igdb-search', art: kind })
    }
  }

  const openGallery = async (kind: ArtworkEditKind, gridGameId: number | null): Promise<void> => {
    setBusy(kind)
    note(kind, { text: t.artEditor.searchingImages, tone: 'info' })
    const result = await window.equon.artworkEdit
      .gridAssets(id, kind, gridGameId)
      .catch((): Result<GridAssetInfo[]> => ({ ok: false, error: { code: 'network' } }))
    setBusy(null)
    note(kind, null)
    if (!result.ok) {
      note(kind, { text: errorText('grid', result.error.code, kind), tone: 'error' })
    } else if (result.data.length > 0) {
      setOverlay({
        kind: 'gallery',
        source: 'grid',
        art: kind,
        items: gridItems(result.data),
        picking: false,
        error: null
      })
    } else if (gridGameId === null) {
      setOverlay({ kind: 'grid-search', art: kind })
    } else {
      note(kind, { text: t.artEditor.noImageGrid, tone: 'error' })
    }
  }

  const fromGrid = (kind: ArtworkEditKind): void => {
    if (isSteam) void openGallery(kind, null)
    else setOverlay({ kind: 'grid-search', art: kind })
  }

  const fromSteam = async (kind: ArtworkEditKind): Promise<void> => {
    setBusy(kind)
    note(kind, { text: t.artEditor.searchingImages, tone: 'info' })
    const result = await window.equon.artworkEdit
      .steamChoices(id)
      .catch((): Result<SteamChoiceInfo[]> => ({ ok: false, error: { code: 'network' } }))
    setBusy(null)
    note(kind, null)
    if (!result.ok) {
      note(kind, { text: errorText('steam', result.error.code, kind), tone: 'error' })
    } else if (result.data.length === 0) {
      note(kind, { text: t.artEditor.noImageSteam, tone: 'error' })
    } else {
      setOverlay({
        kind: 'gallery',
        source: 'steam',
        art: kind,
        items: steamItems(result.data),
        picking: false,
        error: null
      })
    }
  }

  const pickFromGallery = async (
    gallery: Extract<Overlay, { kind: 'gallery' }>,
    itemId: number
  ): Promise<void> => {
    setOverlay({ ...gallery, picking: true, error: null })
    const art = gallery.art
    const pending =
      gallery.source === 'steam' && isSteamGalleryKind(art)
        ? window.equon.artworkEdit.fromSteam(id, art, itemId)
        : window.equon.artworkEdit.fromGrid(id, art, itemId)
    const result = await pending.catch((): Result<ArtworkDraftInfo> => ({
      ok: false,
      error: { code: 'network' }
    }))
    if (result.ok) {
      setChanges((all) => ({
        ...all,
        [gallery.art]: { type: 'draft', version: result.data.version }
      }))
      note(gallery.art, { text: t.artEditor.pending, tone: 'info' })
      setOverlay(null)
    } else {
      setOverlay({
        ...gallery,
        picking: false,
        error: errorText(gallery.source, result.error.code, gallery.art)
      })
    }
  }

  const removeArt = (kind: ArtworkEditKind): void => {
    setChanges((all) => ({ ...all, [kind]: { type: 'removed' } }))
    note(kind, { text: t.artEditor.pendingRemoval, tone: 'info' })
  }

  const save = async (): Promise<void> => {
    if (saving || busy !== null) return
    if (!dirty) {
      leave()
      return
    }
    const remove = PANELS.map((panel) => panel.kind).filter(
      (kind) => changes[kind]?.type === 'removed'
    )
    setSaving(true)
    setSaveFailed(false)
    const result = await window.equon.artworkEdit
      .save(id, remove)
      .catch((): Result<null> => ({ ok: false, error: { code: 'storage-failed' } }))
    setSaving(false)
    if (result.ok) leave()
    else setSaveFailed(true)
  }

  // Start saves from anywhere on the screen; the dialogs on top keep it for themselves.
  useScreenActions({ back: cancel, menu: () => void save() })

  let content: React.JSX.Element
  if (games.status === 'loading') {
    content = <StateMessage message={t.form.loading} />
  } else if (!game) {
    content = (
      <StateMessage
        tone="error"
        message={t.artEditor.loadError}
        action={{ id: 'art:leave', label: t.hints.back, onConfirm: leave }}
      />
    )
  } else {
    const shown = game
    content = (
      <div className="art-editor">
        <h1 className="art-editor__title">
          {t.artEditor.title}
          <span className="art-editor__game">{shown.title}</span>
        </h1>
        <div className="art-editor__panels">
          {PANELS.map(({ kind, igdb, grid, steam }, index) => {
            const change = changes[kind]
            const hasArt = change?.type === 'draft' || (!change && shown.artwork.includes(kind))
            const own = imageSource(shown, kind, change)
            // With no image of its own, the launch image uses the background, and the Home
            // image the launch image, then the background (D-30), choices of this visit included.
            const launchOwn = imageSource(shown, 'launch', changes.launch)
            const background = imageSource(shown, 'background', changes.background)
            const fallback: { source: string; note: string } | null =
              own !== null
                ? null
                : kind === 'launch' && background
                  ? { source: background, note: t.artEditor.usingBackground }
                  : kind === 'home' && launchOwn
                    ? { source: launchOwn, note: t.artEditor.usingLaunch }
                    : kind === 'home' && background
                      ? { source: background, note: t.artEditor.usingBackground }
                      : null
            const current =
              notes[kind] ?? (fallback ? { text: fallback.note, tone: 'info' as const } : undefined)
            return (
              <section
                key={kind}
                className="art-editor__panel"
                ref={(element) => {
                  panels.current[kind] = element
                }}
              >
                <div className="art-editor__side">
                  <h2 className="art-editor__name">{t.artEditor.kinds[kind]}</h2>
                  <Preview kind={kind} source={own ?? fallback?.source ?? null} />
                  {current && (
                    <p
                      className="art-editor__note"
                      data-tone={current.tone}
                      role={current.tone === 'error' ? 'alert' : undefined}
                    >
                      {current.text}
                    </p>
                  )}
                </div>
                <div className="art-editor__actions">
                  {igdb && (
                    <Button
                      id={`art:${kind}:igdb`}
                      label={`${t.artEditor.fromIgdb}: ${t.artEditor.kinds[kind]}`}
                      scroll="none"
                      onFocus={() => revealPanel(kind)}
                      unavailable={busy !== null}
                      autoFocus={index === 0}
                      onConfirm={() => fromIgdb(kind)}
                    >
                      {t.artEditor.fromIgdb}
                    </Button>
                  )}
                  {grid && (
                    <Button
                      id={`art:${kind}:grid`}
                      label={`${t.artEditor.fromGrid}: ${t.artEditor.kinds[kind]}`}
                      scroll="none"
                      onFocus={() => revealPanel(kind)}
                      unavailable={busy !== null}
                      onConfirm={() => fromGrid(kind)}
                    >
                      {t.artEditor.fromGrid}
                    </Button>
                  )}
                  {steam && isSteam && (
                    <Button
                      id={`art:${kind}:steam`}
                      label={`${t.artEditor.fromSteam}: ${t.artEditor.kinds[kind]}`}
                      scroll="none"
                      onFocus={() => revealPanel(kind)}
                      unavailable={busy !== null}
                      onConfirm={() => void fromSteam(kind)}
                    >
                      {t.artEditor.fromSteam}
                    </Button>
                  )}
                  <Button
                    id={`art:${kind}:file`}
                    label={`${t.artEditor.fromFile}: ${t.artEditor.kinds[kind]}`}
                    scroll="none"
                    onFocus={() => revealPanel(kind)}
                    unavailable={busy !== null}
                    onConfirm={() => setOverlay({ kind: 'file', art: kind })}
                  >
                    {t.artEditor.fromFile}
                  </Button>
                  <Button
                    id={`art:${kind}:remove`}
                    label={`${t.artEditor.remove}: ${t.artEditor.kinds[kind]}`}
                    scroll="none"
                    onFocus={() => revealPanel(kind)}
                    unavailable={busy !== null || !hasArt}
                    onConfirm={() => removeArt(kind)}
                  >
                    <img src={deleteIcon} alt="" />
                    <span className="art-editor__danger">{t.artEditor.remove}</span>
                  </Button>
                </div>
              </section>
            )
          })}
        </div>
        <div className="art-editor__footer">
          <Button
            id="art:save"
            variant="primary"
            label={t.artEditor.save}
            unavailable={saving || busy !== null}
            onConfirm={() => void save()}
          >
            {saving ? t.form.saving : t.artEditor.save}
          </Button>
          <Button id="art:cancel" label={t.form.cancel} onConfirm={cancel}>
            <span className="hint__face hint__face--b" aria-hidden>
              B
            </span>
            {t.form.cancel}
          </Button>
          {saveFailed && (
            <p className="art-editor__save-error" role="alert">
              {t.artEditor.saveFailed}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <FocusScope id="screen:game-artwork">
      <div className="screen">
        <TopBar active={currentSection(navigation.route)} />
        <main className="screen__main">{content}</main>
        <Footer hints={HINTS} />
      </div>

      {overlay?.kind === 'file' && (
        <FileBrowserDialog
          kind="image"
          onClose={() => setOverlay(null)}
          onPick={(path) => {
            const kind = overlay.art
            setOverlay(null)
            void fetchImage(kind, 'file', () => window.equon.artworkEdit.fromFile(id, kind, path))
          }}
        />
      )}
      {overlay?.kind === 'igdb-search' && game && (
        <GameSearchDialog
          id="art-igdb"
          title={t.artEditor.igdbTitle}
          searchTitle={t.igdb.searchTitle}
          term={game.title}
          errors={t.igdb.errors}
          search={async (term) => {
            const result = await window.equon.igdb.search(term)
            if (!result.ok) return result
            return {
              ok: true,
              data: result.data.map((each) => ({
                id: each.id,
                name: each.name,
                detail: [each.year, each.developer].filter(Boolean).join(' · ') || undefined
              }))
            }
          }}
          onClose={() => setOverlay(null)}
          onPick={(igdbGameId) => {
            const kind = overlay.art
            setOverlay(null)
            void fetchImage(kind, 'igdb', () =>
              window.equon.artworkEdit.fromIgdb(id, kind, igdbGameId)
            )
          }}
        />
      )}
      {overlay?.kind === 'grid-search' && game && (
        <GameSearchDialog
          id="art-grid"
          title={t.artEditor.gridTitle}
          searchTitle={t.steamGridDb.searchTitle}
          term={game.title}
          errors={t.steamGridDb.errors}
          search={async (term) => {
            const result = await window.equon.artwork.search(term)
            if (!result.ok) return result
            return {
              ok: true,
              data: result.data.map((each) => ({
                id: each.id,
                name: each.name,
                detail: each.year ? String(each.year) : undefined
              }))
            }
          }}
          onClose={() => setOverlay(null)}
          onPick={(gridGameId) => {
            const kind = overlay.art
            setOverlay(null)
            void openGallery(kind, gridGameId)
          }}
        />
      )}
      {overlay?.kind === 'gallery' && (
        <GridGalleryDialog
          title={
            overlay.source === 'steam' ? t.artEditor.steamGalleryTitle : t.artEditor.galleryTitle
          }
          kind={overlay.art}
          items={overlay.items}
          picking={overlay.picking}
          error={overlay.error}
          onClose={() => setOverlay(null)}
          onPick={(assetId) => void pickFromGallery(overlay, assetId)}
        />
      )}
      {overlay?.kind === 'discard' && (
        <ConfirmDialog
          title={t.form.discard.title}
          message={t.form.discard.message}
          confirmLabel={t.form.discard.confirm}
          cancelLabel={t.form.discard.cancel}
          destructive
          onCancel={() => setOverlay(null)}
          onConfirm={leave}
        />
      )}
    </FocusScope>
  )
}
