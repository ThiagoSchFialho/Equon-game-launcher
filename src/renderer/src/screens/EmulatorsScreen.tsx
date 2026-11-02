import { useCallback, useEffect, useState } from 'react'
import type { EmulatorInfo, Result } from '../../../shared/ipc/contract'
import { currentSection, useNavigation } from '../app/navigation'
import { ChoiceDialog } from '../components/Dialog'
import { FileBrowserDialog } from '../components/FileBrowserDialog'
import { Footer, type Hint } from '../components/Footer'
import { FormRow } from '../components/FormRow'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { errorMessage, t } from '../strings'
import './EmulatorsScreen.css'

type Overlay =
  { kind: 'actions'; emulator: EmulatorInfo } | { kind: 'pick'; emulator: EmulatorInfo }

const HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

/**
 * "Adicionar emulador" (DATA_BASE_CONTEXT.md §3.12): choose a supported
 * emulator and point it to its executable. The path serves every game of the
 * emulator's origin, so changing it here applies to all of them.
 */
export function EmulatorsScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const { reload: reloadGames } = useGames()
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

  useScreenActions({ back: () => navigation.back() })

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
    reloadGames()
  }

  let content: React.JSX.Element
  if (loadFailed) {
    content = (
      <StateMessage
        tone="error"
        message={t.emulators.error}
        action={{ id: 'emulators:retry', label: t.library.retry, onConfirm: load }}
      />
    )
  } else if (emulators === null) {
    content = <StateMessage message={t.emulators.loading} />
  } else {
    content = (
      <div className="emulators__list">
        {emulators.map((emulator, index) => (
          <FormRow
            key={emulator.key}
            id={`emulator-${emulator.key}`}
            label={emulator.name}
            value={emulator.executablePath}
            placeholder={t.emulators.notConfigured(`${emulator.key}.exe`)}
            icon="browse"
            autoFocus={index === 0}
            error={errors[emulator.key] || undefined}
            onConfirm={() =>
              setOverlay({ kind: emulator.executablePath ? 'actions' : 'pick', emulator })
            }
          />
        ))}
      </div>
    )
  }

  return (
    <FocusScope id="screen:emulators">
      <div className="screen">
        <TopBar active={currentSection(navigation.route)} />
        <main className="screen__main emulators">
          <h1 className="emulators__title">{t.emulators.title}</h1>
          <p className="emulators__subtitle">{t.emulators.subtitle}</p>
          {content}
        </main>
        <Footer hints={HINTS} />
      </div>

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
    </FocusScope>
  )
}
