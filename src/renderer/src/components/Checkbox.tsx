import { useFocusable } from '../focus/focus-context'
import './Checkbox.css'

interface Props {
  id: string
  label: string
  description?: string
  checked: boolean
  /** Unavailable: still focusable so the reason can be read, but does nothing. */
  unavailable?: boolean
  onChange: (checked: boolean) => void
}

export function Checkbox({
  id,
  label,
  description,
  checked,
  unavailable = false,
  onChange
}: Props): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    onConfirm: unavailable ? undefined : () => onChange(!checked)
  })
  return (
    <button
      ref={setElement}
      className="checkbox"
      role="checkbox"
      data-focused={focused}
      aria-checked={checked}
      aria-disabled={unavailable}
      aria-label={label}
      aria-description={description}
      tabIndex={-1}
      {...mouse}
    >
      <span className="checkbox__box" data-checked={checked}>
        {checked && (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <span className="checkbox__text">
        <span className="checkbox__label">{label}</span>
        {description && <span className="checkbox__description">{description}</span>}
      </span>
    </button>
  )
}
