import { Button } from './Button'
import './StateMessage.css'

interface Props {
  message: string
  hint?: string
  tone?: 'neutral' | 'error'
  /** Optional action, e.g. "Tentar novamente". */
  action?: { id: string; label: string; onConfirm: () => void }
  icon?: string
}

/** Loading, empty, unavailable and error states (DESIGN_SYSTEM.md §9, §11). */
export function StateMessage({
  message,
  hint,
  tone = 'neutral',
  action,
  icon
}: Props): React.JSX.Element {
  return (
    <div className="state-message" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
      {icon && <img className="state-message__icon" src={icon} alt="" />}
      <p className="state-message__text">{message}</p>
      {hint && <p className="state-message__hint">{hint}</p>}
      {action && (
        <Button id={action.id} label={action.label} onConfirm={action.onConfirm} autoFocus>
          {action.label}
        </Button>
      )}
    </div>
  )
}
