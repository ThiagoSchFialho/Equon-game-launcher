import { useContext } from 'react'
import { BackgroundActivityContext } from '../data/background-activity'
import { t } from '../strings'
import './ActivityIndicator.css'

/** Says that something is running in the background; never takes the focus. */
export function ActivityIndicator({
  className
}: {
  /** Where the surrounding bar places it. */
  className: string
}): React.JSX.Element | null {
  const activity = useContext(BackgroundActivityContext)
  if (!activity) return null
  const label = t.activity[activity.task]
  return (
    <div className={`activity-indicator ${className}`} role="status">
      <span className="activity-indicator__spinner" aria-hidden="true" />
      <span className="activity-indicator__text">
        {activity.total > 0
          ? `${label} ${t.activity.progress(activity.done, activity.total)}`
          : label}
      </span>
    </div>
  )
}
