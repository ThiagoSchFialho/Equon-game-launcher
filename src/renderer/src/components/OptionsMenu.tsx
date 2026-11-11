import type { GameFlagsInput } from '../../../shared/ipc/contract'
import { t } from '../strings'
import { ChoiceDialog, type ChoiceItem } from './Dialog'

/**
 * Game options dialog (mockups "menu open"). Edit and remove are offered for non-Steam games,
 * and uninstall for installed Steam games, which Steam itself carries out and confirms (D-23).
 */
export function OptionsMenu({
  title,
  beated,
  hidden,
  onFlags,
  onClose,
  onOpenPage,
  onAchievements,
  onEdit,
  onEditArtwork,
  onRemove,
  onUninstall,
  message
}: {
  title: string
  beated: boolean
  hidden: boolean
  /** Saves a manual flag (every origin). */
  onFlags: (flags: GameFlagsInput) => void
  onClose: () => void
  /** First, when given: the game's page (Home with "Ignorar tela do jogo na home", D-28). */
  onOpenPage?: () => void
  onAchievements: () => void
  onEdit?: () => void
  onEditArtwork?: () => void
  onRemove?: () => void
  onUninstall?: () => void
  /** Why the last action failed. */
  message?: string | null
}): React.JSX.Element {
  const items: ChoiceItem[] = [
    ...(onOpenPage ? [{ id: 'open-page', label: t.menu.openGamePage, onConfirm: onOpenPage }] : []),
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
      : []),
    ...(onUninstall
      ? [
          {
            id: 'uninstall',
            label: t.menu.uninstall,
            onConfirm: onUninstall,
            tone: 'danger' as const,
            separated: true
          }
        ]
      : [])
  ]
  return (
    <ChoiceDialog
      id="options"
      title={title}
      items={items}
      onClose={onClose}
      footer={
        message ? (
          <p className="dialog__message" role="alert">
            {message}
          </p>
        ) : undefined
      }
    />
  )
}
