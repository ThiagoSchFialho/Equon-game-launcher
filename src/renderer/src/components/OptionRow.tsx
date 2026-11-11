import { useFocusable, useFocusManager } from '../focus/focus-context'
import { useUiSounds } from '../sound/sound-context'
import './LevelRow.css'

interface Option<T extends string> {
  value: T
  label: string
}

/**
 * A choice among a few options shown side by side (D-27, "Posição"), set like a LevelRow: left
 * and right pick the neighbouring option, and at either end they move the focus on as usual, so
 * it is never trapped. A moves to the next option, back to the first after the last. The mouse
 * clicks an option.
 */
export function OptionRow<T extends string>({
  id,
  label,
  value,
  options,
  onChange
}: {
  id: string
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
}): React.JSX.Element {
  const sounds = useUiSounds()
  const manager = useFocusManager()
  const index = options.findIndex((option) => option.value === value)
  const pick = (next: number): boolean => {
    const option = options[next]
    if (!option || next === index) return false
    // The focus stays, so it would be silent: it moves a choice like a move of the focus.
    sounds.play('navigate')
    onChange(option.value)
    return true
  }
  const { setElement, focused, mouse } = useFocusable<HTMLDivElement>(id, {
    onConfirm: () => void pick((index + 1) % options.length),
    onDirection: (direction) => {
      if (direction === 'left') return pick(index - 1)
      if (direction === 'right') return pick(index + 1)
      return false
    }
  })
  return (
    <div
      ref={setElement}
      className="level-row"
      data-focused={focused}
      role="radiogroup"
      aria-label={label}
      {...mouse}
    >
      <span className="level-row__label">{label}</span>
      <span className="level-row__control">
        {options.map((option, i) => (
          <button
            key={option.value}
            className="level-row__option"
            tabIndex={-1}
            role="radio"
            aria-checked={i === index}
            data-selected={i === index}
            onClick={(event) => {
              // Picks this option only: the row's own click would also count as A and move on
              // to the next one. The row takes the focus, as with any click.
              event.stopPropagation()
              manager.focus(id)
              pick(i)
            }}
          >
            {option.label}
          </button>
        ))}
      </span>
    </div>
  )
}
