import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFocusable } from '../focus/focus-context'
import { setTextCapture } from '../input/text-capture'
import { t } from '../strings'
import { DialogFrame } from './Dialog'
import './OnScreenKeyboard.css'

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const LETTER_ROWS = [
  [...DIGITS, '-'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '.'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç', '/'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', 'ã', 'õ', 'á', 'ó']
]
/** Extra row for arguments: paths and quoted values need these. */
const SYMBOL_ROW = [':', '\\', '"', '=', '_', '(', ')', '&', "'", ',', '!']

export type KeyboardMode = 'text' | 'symbols' | 'number'

interface Props {
  title: string
  initialValue: string
  placeholder?: string
  mode?: KeyboardMode
  maxLength?: number
  onDone: (value: string) => void
  onCancel: () => void
}

function Key({
  id,
  label,
  wide,
  badge,
  autoFocus,
  ariaLabel,
  onPress
}: {
  id: string
  label: React.ReactNode
  wide?: 'space' | 'action'
  badge?: { text: string; tone: 'x' | 'y' | 'trigger' }
  autoFocus?: boolean
  ariaLabel?: string
  onPress: () => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(`kb:${id}`, {
    onConfirm: onPress,
    autoFocus
  })
  return (
    <button
      ref={setElement}
      className={`key${wide ? ` key--${wide}` : ''}`}
      data-focused={focused}
      aria-label={ariaLabel}
      tabIndex={-1}
      {...mouse}
    >
      {label}
      {badge && <span className={`key__badge key__badge--${badge.tone}`}>{badge.text}</span>}
    </button>
  )
}

/**
 * On-screen keyboard (mockups "add game keyboard", "Library keyboard").
 * Controller: A types the focused key, X erases, Y adds a space, LT toggles
 * capitals, RT finishes, B cancels. A physical keyboard types directly.
 */
export function OnScreenKeyboard({
  title,
  initialValue,
  placeholder,
  mode = 'text',
  maxLength = 4000,
  onDone,
  onCancel
}: Props): React.JSX.Element {
  const [value, setValue] = useState(initialValue)
  const [upper, setUpper] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)
  // Latest value for the physical-keyboard capture registered once on mount.
  const valueRef = useRef(value)
  useLayoutEffect(() => {
    valueRef.current = value
  }, [value])

  const insert = (text: string): void => {
    if (mode === 'number' && !/^\d+$/.test(text)) {
      setWarning(t.keyboard.digitsOnly)
      return
    }
    setWarning(null)
    setValue((v) => (v + text).slice(0, maxLength))
  }
  const erase = (): void => setValue((v) => v.slice(0, -1))
  const done = (): void => onDone(value)

  useEffect(() => {
    setTextCapture((key) => {
      if (key === 'Backspace') {
        erase()
        return true
      }
      if (key === 'Enter') {
        onDone(valueRef.current)
        return true
      }
      if (key.length === 1) {
        insert(key)
        return true
      }
      return false
    })
    return () => setTextCapture(null)
    // insert/erase only use state setters and props fixed for the dialog's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows =
    mode === 'number' ? [DIGITS] : mode === 'symbols' ? [...LETTER_ROWS, SYMBOL_ROW] : LETTER_ROWS
  const caseOf = (key: string): string => (upper ? key.toLocaleUpperCase('pt-BR') : key)

  return (
    <DialogFrame
      id="keyboard"
      title={title}
      onClose={onCancel}
      width="wide"
      actions={{
        secondary: erase,
        tertiary: () => insert(' '),
        leftTrigger: () => setUpper((u) => !u),
        rightTrigger: done
      }}
    >
      <div className="keyboard">
        <div className="keyboard__header">
          <h2 className="keyboard__title">{title}</h2>
          <div className="keyboard__input" data-empty={value === ''}>
            <span>{value === '' ? placeholder : value}</span>
            <span className="keyboard__caret" aria-hidden />
          </div>
          {warning && <p className="keyboard__warning">{warning}</p>}
        </div>
        <div className="keyboard__keys">
          {rows.map((row, r) => (
            <div key={r} className="keyboard__row">
              {row.map((key, c) => (
                <Key
                  key={key}
                  id={`${r}:${c}`}
                  label={caseOf(key)}
                  autoFocus={mode === 'number' ? r === 0 && c === 0 : r === 1 && c === 0}
                  onPress={() => insert(caseOf(key))}
                />
              ))}
            </div>
          ))}
          <div className="keyboard__row keyboard__row--actions">
            {mode !== 'number' && (
              <Key
                id="shift"
                wide="action"
                label={<span aria-hidden>{upper ? '⬆' : '⇧'}</span>}
                ariaLabel={t.keyboard.shift}
                badge={{ text: 'LT', tone: 'trigger' }}
                onPress={() => setUpper((u) => !u)}
              />
            )}
            {mode !== 'number' && (
              <Key
                id="space"
                wide="space"
                label={<span className="key__space" aria-hidden />}
                ariaLabel={t.keyboard.space}
                badge={{ text: 'Y', tone: 'y' }}
                onPress={() => insert(' ')}
              />
            )}
            <Key
              id="backspace"
              wide="action"
              label={<span aria-hidden>⌫</span>}
              ariaLabel={t.keyboard.backspace}
              badge={{ text: 'X', tone: 'x' }}
              onPress={erase}
            />
            <Key
              id="done"
              wide="action"
              label={t.keyboard.done}
              badge={{ text: 'RT', tone: 'trigger' }}
              onPress={done}
            />
          </div>
        </div>
      </div>
    </DialogFrame>
  )
}
