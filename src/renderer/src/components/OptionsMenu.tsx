import { useFocusable, useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import './OptionsMenu.css'

interface Item {
  id: string
  label: string
  /** Undefined = unavailable for now (shown with "Em breve"). */
  onConfirm?: () => void
}

function MenuItem({ item, autoFocus }: { item: Item; autoFocus: boolean }): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(`menu:${item.id}`, {
    onConfirm: item.onConfirm,
    autoFocus
  })
  const unavailable = !item.onConfirm
  return (
    <button
      ref={setElement}
      className="options-menu__item"
      data-focused={focused}
      aria-disabled={unavailable}
      tabIndex={-1}
      {...mouse}
    >
      <span>{item.label}</span>
      {unavailable && <span className="options-menu__soon">{t.menu.soon}</span>}
    </button>
  )
}

/**
 * Game options dialog (mockups "menu open"). Focus moves inside and returns to
 * the opener when it closes; back closes it. Flag actions arrive in Phase 5
 * and achievements in Phase 7; "Desinstalar" is a future item, not in the MVP.
 */
export function OptionsMenu({
  title,
  beated,
  onClose
}: {
  title: string
  beated: boolean
  onClose: () => void
}): React.JSX.Element {
  useScreenActions({ back: onClose, menu: onClose }, true)
  const items: Item[] = [
    { id: 'achievements', label: t.menu.achievements },
    { id: 'beaten', label: beated ? t.menu.unmarkBeaten : t.menu.markBeaten },
    { id: 'hide', label: t.menu.hide },
    { id: 'close', label: t.menu.close, onConfirm: onClose }
  ]
  return (
    <FocusScope id="dialog:options">
      <div className="options-menu__backdrop" onClick={onClose} />
      <div className="options-menu" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="options-menu__title">{title}</h2>
        <div className="options-menu__panel">
          {items.map((item, i) => (
            <MenuItem key={item.id} item={item} autoFocus={i === 0} />
          ))}
        </div>
      </div>
    </FocusScope>
  )
}
