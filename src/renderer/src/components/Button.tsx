import type { ReactNode } from 'react'
import { useFocusable } from '../focus/focus-context'
import type { FocusableOptions } from '../focus/focus-manager'
import './Button.css'

interface Props extends FocusableOptions {
  id: string
  variant?: 'primary' | 'play' | 'install' | 'secondary' | 'icon'
  /** Unavailable: still focusable so the reason can be read, but does nothing. */
  unavailable?: boolean
  label: string
  children: ReactNode
}

export function Button({
  id,
  variant = 'secondary',
  unavailable = false,
  label,
  children,
  onConfirm,
  ...focusOptions
}: Props): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    ...focusOptions,
    onConfirm: unavailable ? undefined : onConfirm
  })
  return (
    <button
      ref={setElement}
      className={`button button--${variant}`}
      data-focused={focused}
      aria-disabled={unavailable}
      aria-label={label}
      tabIndex={-1}
      {...mouse}
    >
      {children}
    </button>
  )
}
