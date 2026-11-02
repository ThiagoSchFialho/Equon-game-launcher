import { useState } from 'react'
import type { OriginInfo, Result } from '../../../shared/ipc/contract'
import { errorMessage, t } from '../strings'
import { ChoiceDialog, type ChoiceItem } from './Dialog'
import { OnScreenKeyboard } from './OnScreenKeyboard'

type Step =
  | { kind: 'list' }
  | { kind: 'actions'; origin: OriginInfo }
  | { kind: 'name'; origin: OriginInfo | null }

/**
 * Manage origins (DATA_BASE_CONTEXT.md §3.10): create, rename, delete unused
 * user origins. Emulators are configured on their own screen (§3.12).
 */
export function OriginsDialog({
  origins,
  onChanged,
  onClose
}: {
  origins: OriginInfo[]
  onChanged: () => void
  onClose: () => void
}): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'list' })
  const [error, setError] = useState<string | null>(null)

  const run = async <T,>(action: Promise<Result<T>>): Promise<boolean> => {
    const result = await action
    if (!result.ok) {
      setError(errorMessage(result.error.code))
      return false
    }
    setError(null)
    onChanged()
    return true
  }
  const back = (): void => setStep({ kind: 'list' })
  const footer = error ? (
    <p className="dialog__message" role="alert">
      {error}
    </p>
  ) : undefined

  if (step.kind === 'name') {
    return (
      <OnScreenKeyboard
        title={step.origin ? t.origins.rename : t.origins.newName}
        initialValue={step.origin?.name ?? ''}
        maxLength={100}
        onCancel={back}
        onDone={(name) => {
          const action = step.origin
            ? window.equon.origins.rename(step.origin.key, name)
            : window.equon.origins.create(name)
          void run(action).then(back)
        }}
      />
    )
  }

  if (step.kind === 'actions') {
    const { origin } = step
    const items: ChoiceItem[] = [
      { id: 'rename', label: t.origins.rename, onConfirm: () => setStep({ kind: 'name', origin }) },
      { id: 'close', label: t.origins.close, onConfirm: back },
      ...(!origin.builtin
        ? [
            {
              id: 'remove',
              label: t.origins.remove,
              tone: 'danger' as const,
              separated: true,
              onConfirm: () =>
                void run(window.equon.origins.remove(origin.key)).then((ok) => ok && back())
            }
          ]
        : [])
    ]
    return (
      <ChoiceDialog
        id="origin-actions"
        title={origin.name}
        items={items}
        onClose={back}
        footer={footer}
      />
    )
  }

  const items: ChoiceItem[] = [
    ...origins.map((origin) => ({
      id: origin.key,
      label: origin.name,
      detail: origin.builtin ? t.origins.builtin : undefined,
      onConfirm: () => setStep({ kind: 'actions', origin })
    })),
    {
      id: 'add',
      label: t.origins.add,
      onConfirm: () => setStep({ kind: 'name', origin: null }),
      separated: true
    },
    { id: 'close', label: t.origins.close, onConfirm: onClose }
  ]
  return (
    <ChoiceDialog
      id="origins"
      title={t.origins.title}
      items={items}
      onClose={onClose}
      footer={footer}
    />
  )
}
