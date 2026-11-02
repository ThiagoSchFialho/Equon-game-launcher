import { useState } from 'react'
import { daysInMonth, toIsoDate } from '../../../shared/text-format'
import { useFocusable } from '../focus/focus-context'
import { t } from '../strings'
import { DialogFrame } from './Dialog'
import './DatePickerDialog.css'

const MIN_YEAR = 1970

function Column({
  id,
  label,
  value,
  autoFocus,
  onStep,
  onConfirm
}: {
  id: string
  label: string
  value: string
  autoFocus?: boolean
  onStep: (delta: 1 | -1) => void
  onConfirm: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLDivElement>(`date:${id}`, {
    autoFocus,
    onConfirm,
    // Up/down change the value; left/right still move between columns.
    onDirection: (direction) => {
      if (direction === 'up') onStep(1)
      else if (direction === 'down') onStep(-1)
      else return false
      return true
    }
  })
  return (
    <div ref={setElement} className="date-column" data-focused={focused} {...mouse}>
      <span className="date-column__label">{label}</span>
      <button
        className="date-column__arrow"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation()
          onStep(1)
        }}
        aria-label="+"
      >
        ▲
      </button>
      <span className="date-column__value">{value}</span>
      <button
        className="date-column__arrow"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation()
          onStep(-1)
        }}
        aria-label="−"
      >
        ▼
      </button>
    </div>
  )
}

function ActionButton({
  id,
  label,
  onConfirm
}: {
  id: string
  label: string
  onConfirm: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(`date:${id}`, {
    onConfirm
  })
  return (
    <button
      ref={setElement}
      className="date-action"
      data-focused={focused}
      tabIndex={-1}
      {...mouse}
    >
      {label}
    </button>
  )
}

/** Controller-friendly date picker: up/down change the focused day, month or year. */
export function DatePickerDialog({
  value,
  onDone,
  onCancel
}: {
  /** YYYY-MM-DD or null. */
  value: string | null
  onDone: (value: string | null) => void
  onCancel: () => void
}): React.JSX.Element {
  const today = new Date()
  const maxYear = today.getFullYear() + 5
  const [initialYear, initialMonth, initialDay] = value
    ? value.split('-').map(Number)
    : [today.getFullYear(), today.getMonth() + 1, today.getDate()]
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [day, setDay] = useState(initialDay)

  const wrap = (v: number, min: number, max: number): number => (v > max ? min : v < min ? max : v)
  const confirm = (): void => onDone(toIsoDate(year, month, day))
  const maxDay = daysInMonth(year, month)

  return (
    <DialogFrame id="date" title={t.datePicker.title} onClose={onCancel} width="wide">
      <h2 className="dialog__title">{t.datePicker.title}</h2>
      <div className="dialog__panel date-picker">
        <Column
          id="day"
          label={t.datePicker.day}
          value={String(Math.min(day, maxDay)).padStart(2, '0')}
          autoFocus
          onStep={(d) => setDay((v) => wrap(Math.min(v, maxDay) + d, 1, maxDay))}
          onConfirm={confirm}
        />
        <Column
          id="month"
          label={t.datePicker.month}
          value={String(month).padStart(2, '0')}
          onStep={(d) => setMonth((v) => wrap(v + d, 1, 12))}
          onConfirm={confirm}
        />
        <Column
          id="year"
          label={t.datePicker.year}
          value={String(year)}
          onStep={(d) => setYear((v) => Math.min(maxYear, Math.max(MIN_YEAR, v + d)))}
          onConfirm={confirm}
        />
        <div className="date-picker__actions">
          <ActionButton id="ok" label={t.datePicker.ok} onConfirm={confirm} />
          <ActionButton id="clear" label={t.datePicker.clear} onConfirm={() => onDone(null)} />
        </div>
      </div>
    </DialogFrame>
  )
}
