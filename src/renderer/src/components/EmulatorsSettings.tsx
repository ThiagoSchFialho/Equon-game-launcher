import { Fragment, useCallback, useEffect, useState } from 'react'
import type { EmulatorInfo, Result } from '../../../shared/ipc/contract'
import { useGames } from '../data/games'
import { errorMessage, t } from '../strings'
import { ChoiceDialog } from './Dialog'
import { FileBrowserDialog } from './FileBrowserDialog'
import { FormRow } from './FormRow'
import { StateMessage } from './StateMessage'

/** Errors of the folder row are kept apart from the executable's. */
const folderKey = (emulator: EmulatorInfo): string => `${emulator.key}:roms`

type Overlay =
  | { kind: 'actions'; emulator: EmulatorInfo }
  | { kind: 'pick'; emulator: EmulatorInfo }
  | { kind: 'folder-actions'; emulator: EmulatorInfo }
  | { kind: 'pick-folder'; emulator: EmulatorInfo }

/**
 * Settings › Emuladores (DATA_BASE_CONTEXT.md §3.12): point each supported
 * emulator to its executable. The path serves every game of the emulator's
 * origin, so changing it here applies to all of them. A configured emulator
 * can also have a folder whose loose ROMs become games.
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
        <Fragment key={emulator.key}>
          <h2 className="settings__group">{emulator.name}</h2>
          {/* One panel per emulator (owner's sketch): the executable, then the ROM folder. */}
          <div className="settings__emulator">
            <FormRow
              id={`emulator-${emulator.key}`}
              label={t.emulators.executableLabel}
              ariaLabel={t.emulators.executable(emulator.name)}
              value={emulator.executablePath}
              placeholder={t.emulators.notConfigured(`${emulator.key}.exe`)}
              icon="browse"
              error={errors[emulator.key] || undefined}
              onConfirm={() =>
                setOverlay({ kind: emulator.executablePath ? 'actions' : 'pick', emulator })
              }
            />
            {/* The folder belongs to a configured emulator: its games open with it. */}
            <FormRow
              id={`emulator-${emulator.key}-roms`}
              label={t.emulators.romDirectoryLabel}
              ariaLabel={t.emulators.romDirectory(emulator.name)}
              value={emulator.executablePath ? emulator.romDirectory : null}
              placeholder={
                emulator.executablePath
                  ? t.emulators.romDirectoryEmpty
                  : t.emulators.romDirectoryNeedsExecutable
              }
              icon="browse"
              unavailable={!emulator.executablePath}
              error={errors[folderKey(emulator)] || undefined}
              onConfirm={() =>
                setOverlay({
                  kind: emulator.romDirectory ? 'folder-actions' : 'pick-folder',
                  emulator
                })
              }
            />
          </div>
        </Fragment>
      ))}
      {emulators.some((emulator) => emulator.executablePath) && (
        <p className="settings__subtitle">{t.emulators.romDirectoryNote}</p>
      )}

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
      {overlay?.kind === 'folder-actions' && (
        <ChoiceDialog
          id="emulator-folder-actions"
          title={t.emulators.romDirectory(overlay.emulator.name)}
          onClose={() => setOverlay(null)}
          footer={<p className="dialog__message">{t.emulators.romDirectoryRemoveNote}</p>}
          items={[
            {
              id: 'change',
              label: t.emulators.romDirectoryChange,
              onConfirm: () => setOverlay({ kind: 'pick-folder', emulator: overlay.emulator })
            },
            { id: 'close', label: t.emulators.close, onConfirm: () => setOverlay(null) },
            {
              id: 'remove',
              label: t.emulators.romDirectoryRemove,
              tone: 'danger',
              separated: true,
              onConfirm: () =>
                void run(
                  folderKey(overlay.emulator),
                  window.equon.emulators.setRomDirectory(overlay.emulator.key, null)
                )
            }
          ]}
        />
      )}
      {overlay?.kind === 'pick-folder' && (
        <FileBrowserDialog
          kind="directory"
          // Changing the folder starts where the current one is.
          initialPath={overlay.emulator.romDirectory}
          onClose={() => setOverlay(null)}
          onPick={(path) =>
            void run(
              folderKey(overlay.emulator),
              window.equon.emulators.setRomDirectory(overlay.emulator.key, path)
            )
          }
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
