import { t } from '../strings'
import { ChoiceDialog, type ChoiceItem } from './Dialog'

/**
 * Game options dialog (mockups "menu open"). Flag actions arrive in Phase 5
 * and achievements in Phase 7; "Desinstalar" is a future item, not in the
 * MVP. Edit and remove are offered for non-Steam games.
 */
export function OptionsMenu({
  title,
  beated,
  onClose,
  onEdit,
  onRemove
}: {
  title: string
  beated: boolean
  onClose: () => void
  onEdit?: () => void
  onRemove?: () => void
}): React.JSX.Element {
  const items: ChoiceItem[] = [
    { id: 'achievements', label: t.menu.achievements, detail: t.menu.soon },
    { id: 'beaten', label: beated ? t.menu.unmarkBeaten : t.menu.markBeaten, detail: t.menu.soon },
    { id: 'hide', label: t.menu.hide, detail: t.menu.soon },
    ...(onEdit ? [{ id: 'edit', label: t.menu.edit, onConfirm: onEdit }] : []),
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
