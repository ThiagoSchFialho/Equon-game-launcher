import { useSystemMenu } from '../app/system-menu'
import xboxIcon from '../assets/icons/xbox.svg'
import { t } from '../strings'
import { ActivityIndicator } from './ActivityIndicator'
import './Footer.css'

export type HintButton = 'A' | 'B' | 'X' | 'Y' | 'LB/RB' | 'menu'

export interface Hint {
  button: HintButton
  label: string
}

function Glyph({ button }: { button: HintButton }): React.JSX.Element {
  if (button === 'LB/RB') {
    return (
      <span className="hint__shoulders" aria-hidden>
        <span className="hint__shoulder">LB</span>/<span className="hint__shoulder">RB</span>
      </span>
    )
  }
  if (button === 'menu') {
    return (
      <span className="hint__menu" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    )
  }
  return (
    <span className={`hint__face hint__face--${button.toLowerCase()}`} aria-hidden>
      {button}
    </span>
  )
}

/** While the system menu is open, the hints of the screen below do not apply. */
const SYSTEM_MENU_HINTS: readonly Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

/** For the mouse: the controller uses the Xbox button, so the grids above keep their focus path. */
function SystemMenuButton(): React.JSX.Element {
  const { open, toggle } = useSystemMenu()
  return (
    <button
      className="footer__system"
      data-open={open}
      aria-label={t.systemMenu.title}
      aria-expanded={open}
      tabIndex={-1}
      onClick={toggle}
    >
      <img src={xboxIcon} alt="" />
    </button>
  )
}

/**
 * Bottom bar with the system menu and the controller hints for the current screen.
 * Screens without a top bar pass `showActivity`: background work is reported here.
 */
export function Footer({
  hints,
  showActivity = false
}: {
  hints: readonly Hint[]
  showActivity?: boolean
}): React.JSX.Element {
  const { open } = useSystemMenu()
  return (
    <footer className="footer">
      <SystemMenuButton />
      {showActivity && <ActivityIndicator className="footer__activity" />}
      <ul className="footer__hints">
        {(open ? SYSTEM_MENU_HINTS : hints).map((hint) => (
          <li key={hint.button} className="hint">
            <Glyph button={hint.button} />
            <span>{hint.label}</span>
          </li>
        ))}
      </ul>
    </footer>
  )
}
