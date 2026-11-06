import {
  gridThumbnailUrl,
  type ArtworkEditKind,
  type GridAssetInfo
} from '../../../shared/ipc/contract'
import { useFocusable } from '../focus/focus-context'
import { t } from '../strings'
import { Button } from './Button'
import { DialogFrame } from './Dialog'
import './GridGalleryDialog.css'

function Thumbnail({
  asset,
  kind,
  autoFocus,
  onPick
}: {
  asset: GridAssetInfo
  kind: ArtworkEditKind
  autoFocus: boolean
  onPick?: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(
    `art-gallery:${asset.id}`,
    { onConfirm: onPick, autoFocus }
  )
  const size = `${asset.width}×${asset.height}`
  return (
    <button
      ref={setElement}
      className="art-gallery__item"
      data-focused={focused}
      data-kind={kind}
      aria-label={t.artEditor.galleryItem(size)}
      aria-disabled={!onPick}
      tabIndex={-1}
      {...mouse}
    >
      <img className="art-gallery__image" src={gridThumbnailUrl(asset.id)} alt="" loading="lazy" />
      <span className="art-gallery__size">{size}</span>
    </button>
  )
}

/** The images of one kind on SteamGridDB, as thumbnails, for the user to choose. */
export function GridGalleryDialog({
  kind,
  assets,
  picking,
  error,
  onPick,
  onClose
}: {
  kind: ArtworkEditKind
  assets: readonly GridAssetInfo[]
  /** An image was chosen and is on its way. */
  picking: boolean
  error: string | null
  onPick: (assetId: number) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <DialogFrame id="art-gallery" title={t.artEditor.galleryTitle} onClose={onClose} width="wide">
      <h2 className="dialog__title">{t.artEditor.galleryTitle}</h2>
      <div className="dialog__panel art-gallery">
        <p className="dialog__message" role={error ? 'alert' : undefined}>
          {error ?? (picking ? t.artEditor.downloading : t.artEditor.galleryPick)}
        </p>
        <div className="art-gallery__grid" data-kind={kind}>
          {assets.map((asset, index) => (
            <Thumbnail
              key={asset.id}
              asset={asset}
              kind={kind}
              autoFocus={index === 0}
              onPick={picking ? undefined : () => onPick(asset.id)}
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
