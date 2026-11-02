import chevronIcon from '../assets/icons/arrow-down.svg'
import searchIcon from '../assets/icons/search.svg'
import { useFocusable } from '../focus/focus-context'
import './ToolbarField.css'

/**
 * Library toolbar control (mockup "Library"): the search box or a select
 * shown as "LABEL: VALUE ▾". Confirming opens its keyboard or choice dialog.
 */
export function ToolbarField({
  id,
  kind,
  label,
  value,
  onConfirm
}: {
  id: string
  kind: 'search' | 'select'
  label: string
  /** Search: the current query (empty shows the label); select: the chosen option. */
  value: string
  onConfirm: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, { onConfirm })
  return (
    <button
      ref={setElement}
      className={`toolbar-field toolbar-field--${kind}`}
      data-focused={focused}
      aria-label={kind === 'search' ? label : `${label}: ${value}`}
      tabIndex={-1}
      {...mouse}
    >
      {kind === 'search' ? (
        <>
          <img className="toolbar-field__search" src={searchIcon} alt="" />
          <span className="toolbar-field__text" data-empty={value === ''}>
            {value === '' ? label : value}
          </span>
        </>
      ) : (
        <>
          <span className="toolbar-field__text">
            <span className="toolbar-field__label">{label}: </span>
            {value}
          </span>
          <img className="toolbar-field__chevron" src={chevronIcon} alt="" />
        </>
      )}
    </button>
  )
}
