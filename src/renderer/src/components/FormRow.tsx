import chevronIcon from '../assets/icons/arrow-down.svg'
import calendarIcon from '../assets/icons/game-page-calendar.svg'
import { useFocusable } from '../focus/focus-context'
import './FormRow.css'

interface Props {
  id: string
  label: string
  required?: boolean
  /** Current value as displayed; null/empty shows the placeholder. */
  value: string | null
  placeholder?: string
  /** Trailing affordance: a select, a date or a file/folder picker. */
  icon?: 'chevron' | 'calendar' | 'browse'
  multiline?: boolean
  error?: string | null
  autoFocus?: boolean
  /** Name for assistive tech when the visible label needs its context (e.g. "Executável (Yuzu)"). */
  ariaLabel?: string
  /** Shown dimmed and does nothing, still focusable so the reason can be read. */
  unavailable?: boolean
  onConfirm: () => void
}

/** One field of the add/edit form (mockup "add game"): label on the left, value box on the right. */
export function FormRow({
  id,
  label,
  required,
  value,
  placeholder,
  icon,
  multiline,
  error,
  autoFocus,
  ariaLabel,
  unavailable = false,
  onConfirm
}: Props): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(`form:${id}`, {
    onConfirm: unavailable ? undefined : onConfirm,
    autoFocus
  })
  const empty = value === null || value === ''
  return (
    <div className="form-row-wrap">
      <button
        ref={setElement}
        className="form-row"
        data-focused={focused}
        data-invalid={Boolean(error)}
        data-multiline={multiline}
        aria-label={ariaLabel ?? label}
        aria-invalid={Boolean(error)}
        aria-disabled={unavailable || undefined}
        tabIndex={-1}
        {...mouse}
      >
        <span className="form-row__label">
          {label}
          {required && '*'}
        </span>
        <span className="form-row__value" data-empty={empty}>
          <span className="form-row__text">{empty ? placeholder : value}</span>
          {icon === 'chevron' && <img className="form-row__icon" src={chevronIcon} alt="" />}
          {icon === 'calendar' && <img className="form-row__icon" src={calendarIcon} alt="" />}
          {icon === 'browse' && <span className="form-row__browse">…</span>}
        </span>
      </button>
      {error && (
        <p className="form-row__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
