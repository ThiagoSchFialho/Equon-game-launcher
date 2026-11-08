import { useEffect, type ReactNode } from 'react'
import { useFocusable, useScreenActions } from '../focus/focus-context'
import { useUiSounds } from '../sound/sound-context'
import type { ScreenActions } from '../focus/focus-manager'
import { FocusScope } from '../focus/FocusProvider'
import './Dialog.css'

/**
 * Modal layer: backdrop, focus scope (focus moves in and returns to the
 * opener on close) and a modal action layer where back closes the dialog.
 */
export function DialogFrame({
  id,
  title,
  onClose,
  actions,
  width = 'narrow',
  children
}: {
  id: string
  title: string
  onClose: () => void
  actions?: ScreenActions
  width?: 'narrow' | 'wide'
  children: ReactNode
}): React.JSX.Element {
  useScreenActions({ back: onClose, ...actions }, true)
  // Opening a modal has its own sound (owner decision); changing its content does not.
  const sounds = useUiSounds()
  useEffect(() => sounds.play('modal-open'), [sounds])
  return (
    <FocusScope id={`dialog:${id}`}>
      <div className="dialog__backdrop" onClick={onClose} />
      <div className={`dialog dialog--${width}`} role="dialog" aria-modal="true" aria-label={title}>
        {children}
      </div>
    </FocusScope>
  )
}

export interface ChoiceItem {
  id: string
  label: string
  /** Secondary text on the right (e.g. "Em breve" or the current value). */
  detail?: string
  /** Undefined = unavailable (shown dimmed). */
  onConfirm?: () => void
  tone?: 'danger'
  selected?: boolean
  /** Starts a new group with a divider above. */
  separated?: boolean
  /** A small centered button, for a secondary way out next to the real choices. */
  compact?: boolean
}

export function ChoiceRow({
  dialogId,
  item,
  autoFocus
}: {
  dialogId: string
  item: ChoiceItem
  autoFocus: boolean
}): React.JSX.Element {
  // Dialogs can stack, so item ids are scoped by the dialog id.
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(
    `choice:${dialogId}:${item.id}`,
    {
      onConfirm: item.onConfirm,
      autoFocus
    }
  )
  return (
    <button
      ref={setElement}
      className="choice"
      data-focused={focused}
      data-tone={item.tone}
      data-selected={item.selected}
      data-separated={item.separated}
      data-compact={item.compact}
      aria-disabled={!item.onConfirm}
      tabIndex={-1}
      {...mouse}
    >
      <span className="choice__label">{item.label}</span>
      {item.detail && <span className="choice__detail">{item.detail}</span>}
    </button>
  )
}

/** A titled list of choices (options menu, select fields, origin actions). */
export function ChoiceDialog({
  id,
  title,
  items,
  onClose,
  footer,
  width
}: {
  id: string
  title: string
  items: readonly ChoiceItem[]
  onClose: () => void
  footer?: ReactNode
  /** Wide for lists of long names; narrow by default. */
  width?: 'narrow' | 'wide'
}): React.JSX.Element {
  const initial = Math.max(
    0,
    items.findIndex((item) => item.selected)
  )
  return (
    <DialogFrame id={id} title={title} onClose={onClose} width={width}>
      <h2 className="dialog__title">{title}</h2>
      <div className="dialog__panel dialog__panel--list">
        {footer}
        {items.map((item, i) => (
          <ChoiceRow key={item.id} dialogId={id} item={item} autoFocus={i === initial} />
        ))}
      </div>
    </DialogFrame>
  )
}

/** Yes/no confirmation; the safe choice has the initial focus. */
export function ConfirmDialog({
  id = 'confirm',
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel
}: {
  /** Needed when it can open above another confirmation. */
  id?: string
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <ChoiceDialog
      id={id}
      title={title}
      onClose={onCancel}
      footer={<p className="dialog__message">{message}</p>}
      items={[
        { id: 'cancel', label: cancelLabel, onConfirm: onCancel, selected: true },
        {
          id: 'confirm',
          label: confirmLabel,
          onConfirm,
          tone: destructive ? 'danger' : undefined
        }
      ]}
    />
  )
}
