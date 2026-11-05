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

/**
 * Bottom bar with the controller hints that apply to the current screen.
 * Screens without a top bar pass `showActivity`: background work is reported here.
 */
export function Footer({
  hints,
  showActivity = false
}: {
  hints: readonly Hint[]
  showActivity?: boolean
}): React.JSX.Element {
  return (
    <footer className="footer">
      {showActivity && <ActivityIndicator className="footer__activity" />}
      <ul className="footer__hints">
        {hints.map((hint) => (
          <li key={hint.button} className="hint">
            <Glyph button={hint.button} />
            <span>{hint.label}</span>
          </li>
        ))}
      </ul>
    </footer>
  )
}
