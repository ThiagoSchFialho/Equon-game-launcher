import type { GameFlagsInput } from '../../../shared/ipc/contract'
import { t } from '../strings'
import { ChoiceDialog, type ChoiceItem } from './Dialog'

/**
 * Game options dialog (mockups "menu open"). "Desinstalar" is a future item, not in the
 * MVP. Edit, SteamGridDB artwork and remove are offered for non-Steam games.
 */
export function OptionsMenu({
  title,
  beated,
  hidden,
  onFlags,
  onClose,
  onAchievements,
  onEdit,
  onEditArtwork,
  onRemove
}: {
  title: string
  beated: boolean
  hidden: boolean
  /** Saves a manual flag (every origin). */
  onFlags: (flags: GameFlagsInput) => void
  onClose: () => void
  onAchievements: () => void
  onEdit?: () => void
  onEditArtwork?: () => void
  onRemove?: () => void
}): React.JSX.Element {
  const items: ChoiceItem[] = [
    { id: 'achievements', label: t.menu.achievements, onConfirm: onAchievements },
    {
      id: 'beaten',
      label: beated ? t.menu.unmarkBeaten : t.menu.markBeaten,
      onConfirm: () => onFlags({ beated: !beated })
    },
    {
      id: 'hide',
      label: hidden ? t.menu.unhide : t.menu.hide,
      onConfirm: () => onFlags({ hidden: !hidden })
    },
    ...(onEdit ? [{ id: 'edit', label: t.menu.edit, onConfirm: onEdit }] : []),
    ...(onEditArtwork
      ? [{ id: 'edit-artwork', label: t.menu.editArtwork, onConfirm: onEditArtwork }]
      : []),
    { id: 'close', label: t.menu.close, onConfirm: onClose },
    ...(onRemove
      ? [
          {
            id: 'remove',
            label: t.menu.remove,
            onConfirm: onRemove,
            tone: 'danger' as const,
            separated: true
          }
        ]
      : [])
  ]
  return <ChoiceDialog id="options" title={title} items={items} onClose={onClose} />
}
