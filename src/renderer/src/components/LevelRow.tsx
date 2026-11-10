import { useFocusable } from '../focus/focus-context'
import { useUiSounds } from '../sound/sound-context'
import './LevelRow.css'

/** More steps than this get a continuous bar instead of ticks. */
const MAX_TICKS = 20

interface Props {
  id: string
  label: string
  /** As shown next to the label, e.g. "60%". */
  valueText: string
  value: number
  min: number
  max: number
  step?: number
  /** Unavailable: still focusable so the reason can be read, but does nothing. */
  unavailable?: boolean
  onChange: (value: number) => void
}

/**
 * A value set with left and right (D-25): a direction that changes it is used here, and one at
 * the end of the range moves the focus on as usual, so the focus is never trapped. The mouse
 * uses the − and + on its sides.
 */
export function LevelRow({
  id,
  label,
  valueText,
  value,
  min,
  max,
  step = 1,
  unavailable = false,
  onChange
}: Props): React.JSX.Element {
  const sounds = useUiSounds()
  const change = (delta: number): boolean => {
    const next = Math.min(max, Math.max(min, value + delta))
    if (unavailable || next === value) return false
    // The focus stays, so it would be silent: it moves a value like a move of the focus.
    sounds.play('navigate')
    onChange(next)
    return true
  }
  const { setElement, focused, mouse } = useFocusable<HTMLDivElement>(id, {
    onDirection: (direction) => {
      if (direction === 'left') return change(-step)
      if (direction === 'right') return change(step)
      return false
    }
  })
  const steps = Math.round((max - min) / step)
  const filled = Math.round((value - min) / step)
  return (
    <div
      ref={setElement}
      className="level-row"
      data-focused={focused}
      role="slider"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={unavailable}
      {...mouse}
    >
      <span className="level-row__label">{label}</span>
      <span className="level-row__control">
        <button
          className="level-row__step"
          tabIndex={-1}
          aria-label={`${label}: −`}
          disabled={unavailable || value <= min}
          onClick={() => change(-step)}
        >
          −
        </button>
        {/* One tick per step reads well up to a few dozen; past that, a continuous bar (D-27). */}
        {steps > MAX_TICKS ? (
          <span className="level-row__track" aria-hidden>
            <span
              className="level-row__fill"
              style={{ transform: `scaleX(${steps === 0 ? 0 : filled / steps})` }}
            />
          </span>
        ) : (
          <span className="level-row__bar" aria-hidden>
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} className="level-row__tick" data-on={i < filled} />
            ))}
          </span>
        )}
        <button
          className="level-row__step"
          tabIndex={-1}
          aria-label={`${label}: +`}
          disabled={unavailable || value >= max}
          onClick={() => change(step)}
        >
          +
        </button>
        <span className="level-row__value">{valueText}</span>
      </span>
    </div>
  )
}
