import type { TrophyTotals } from '../../../shared/ipc/contract'
import { t } from '../strings'
import { TROPHY_IMAGES } from './trophy-images'
import './Trophies.css'

const ORDER = ['platine', 'gold', 'silver', 'bronze'] as const

/** Trophy totals by category (mockup "Achievements"); each has its own art and a label. */
export function TrophyRow({ totals }: { totals: TrophyTotals }): React.JSX.Element {
  return (
    <ul className="trophy-row">
      {ORDER.map((tier) => (
        <li key={tier} className="trophy-row__item">
          <img src={TROPHY_IMAGES[tier]} alt={t.achievements.tiers[tier]} />
          <span>{totals[tier]}</span>
        </li>
      ))}
    </ul>
  )
}

/** Completion bar; static, so reduced motion needs nothing special. */
export function ProgressBar({ percent }: { percent: number }): React.JSX.Element {
  return (
    <div className="progress-bar" aria-hidden>
      <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
    </div>
  )
}
