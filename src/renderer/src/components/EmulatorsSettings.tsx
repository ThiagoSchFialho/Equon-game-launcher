import { useCallback, useEffect, useState } from 'react'
import type { EmulatorInfo, Result } from '../../../shared/ipc/contract'
import { useGames } from '../data/games'
import { errorMessage, t } from '../strings'
import { ChoiceDialog } from './Dialog'
import { FileBrowserDialog } from './FileBrowserDialog'
import { FormRow } from './FormRow'
import { StateMessage } from './StateMessage'

type Overlay =
  { kind: 'actions'; emulator: EmulatorInfo } | { kind: 'pick'; emulator: EmulatorInfo }

/**
 * Settings › Emuladores (DATA_BASE_CONTEXT.md §3.12): point each supported
 * emulator to its executable. The path serves every game of the emulator's
 * origin, so changing it here applies to all of them.
 */
export function EmulatorsSettings(): React.JSX.Element {
  const { refresh: refreshGames } = useGames()
  const [emulators, setEmulators] = useState<EmulatorInfo[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    window.equon.emulators.list().then(
      (list) => {
        setLoadFailed(false)
        setEmulators(list)
      },
      () => setLoadFailed(true)
    )
  }, [])
  useEffect(load, [load])

  const run = async (key: string, action: Promise<Result<unknown>>): Promise<void> => {
    const result = await action
    setOverlay(null)
    if (!result.ok) {
      setErrors((e) => ({ ...e, [key]: errorMessage(result.error.code) }))
      return
    }
    setErrors((e) => ({ ...e, [key]: '' }))
    load()
    // Play availability of the emulator's games depends on this path.
    refreshGames()
  }

  if (loadFailed) {
    return (
      <StateMessage
        tone="error"
        message={t.emulators.error}
        action={{ id: 'emulators:retry', label: t.library.retry, onConfirm: load }}
      />
    )
  }
  if (emulators === null) return <StateMessage message={t.emulators.loading} />

  return (
    <div className="settings__sections">
      <p className="settings__subtitle">{t.emulators.subtitle}</p>
      {emulators.map((emulator) => (
        <FormRow
          key={emulator.key}
          id={`emulator-${emulator.key}`}
          label={emulator.name}
          value={emulator.executablePath}
          placeholder={t.emulators.notConfigured(`${emulator.key}.exe`)}
          icon="browse"
          error={errors[emulator.key] || undefined}
          onConfirm={() =>
            setOverlay({ kind: emulator.executablePath ? 'actions' : 'pick', emulator })
          }
        />
      ))}

      {overlay?.kind === 'actions' && (
        <ChoiceDialog
          id="emulator-actions"
          title={overlay.emulator.name}
          onClose={() => setOverlay(null)}
          footer={<p className="dialog__message">{t.emulators.changeNote}</p>}
          items={[
            {
              id: 'change',
              label: t.emulators.change,
              onConfirm: () => setOverlay({ kind: 'pick', emulator: overlay.emulator })
            },
            { id: 'close', label: t.emulators.close, onConfirm: () => setOverlay(null) },
            {
              id: 'remove',
              label: t.emulators.remove,
              tone: 'danger',
              separated: true,
              onConfirm: () =>
                void run(overlay.emulator.key, window.equon.emulators.remove(overlay.emulator.key))
            }
          ]}
        />
      )}
      {overlay?.kind === 'pick' && (
        <FileBrowserDialog
          kind="emulator"
          onClose={() => setOverlay(null)}
          onPick={(path) =>
            void run(overlay.emulator.key, window.equon.emulators.set(overlay.emulator.key, path))
          }
        />
      )}
    </div>
  )
}
