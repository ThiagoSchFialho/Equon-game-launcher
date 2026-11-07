import type { ArtworkEditKind } from '../../../shared/ipc/contract'
import { useFocusable } from '../focus/focus-context'
import { t } from '../strings'
import { Button } from './Button'
import { DialogFrame } from './Dialog'
import './GridGalleryDialog.css'

export interface GalleryItem {
  id: number
  /** Thumbnail, brought by main. */
  source: string
  label: string
  caption: string
}

function Thumbnail({
  item,
  kind,
  autoFocus,
  onPick
}: {
  item: GalleryItem
  kind: ArtworkEditKind
  autoFocus: boolean
  onPick?: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(`art-gallery:${item.id}`, {
    onConfirm: onPick,
    autoFocus
  })
  return (
    <button
      ref={setElement}
      className="art-gallery__item"
      data-focused={focused}
      data-kind={kind}
      aria-label={item.label}
      aria-disabled={!onPick}
      tabIndex={-1}
      {...mouse}
    >
      <img className="art-gallery__image" src={item.source} alt="" loading="lazy" />
      <span className="art-gallery__size">{item.caption}</span>
    </button>
  )
}

/** Images of one kind from an online source, as thumbnails, for the user to choose. */
export function GridGalleryDialog({
  title,
  kind,
  items,
  picking,
  error,
  onPick,
  onClose
}: {
  title: string
  kind: ArtworkEditKind
  items: readonly GalleryItem[]
  /** An image was chosen and is on its way. */
  picking: boolean
  error: string | null
  onPick: (id: number) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <DialogFrame id="art-gallery" title={title} onClose={onClose} width="wide">
      <h2 className="dialog__title">{title}</h2>
      <div className="dialog__panel art-gallery">
        <p className="dialog__message" role={error ? 'alert' : undefined}>
          {error ?? (picking ? t.artEditor.downloading : t.artEditor.galleryPick)}
        </p>
        <div className="art-gallery__grid" data-kind={kind}>
          {items.map((item, index) => (
            <Thumbnail
              key={item.id}
              item={item}
              kind={kind}
              autoFocus={index === 0}
              onPick={picking ? undefined : () => onPick(item.id)}
            />
          ))}
        </div>
        <div className="art-gallery__close">
          <Button id="art-gallery:close" label={t.artEditor.close} onConfirm={onClose}>
            {t.artEditor.close}
          </Button>
        </div>
      </div>
    </DialogFrame>
  )
}
