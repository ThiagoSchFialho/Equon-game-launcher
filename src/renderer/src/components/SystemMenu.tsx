import { useEffect, useRef, useState } from 'react'
import { useNavigation } from '../app/navigation'
import { useRunning } from '../data/running'
import { useUiSounds } from '../sound/sound-context'
import { useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import { ChoiceRow, ConfirmDialog, type ChoiceItem } from './Dialog'
import './SystemMenu.css'

export const SYSTEM_MENU_SCOPE = 'dialog:system-menu'

/**
 * Opened by the Xbox button or the footer icon, on any screen (D-21). The list is
 * replaced by a confirmation, and cancelling comes back to the list.
 */
export function SystemMenu({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [step, setStep] = useState<'list' | 'shutdown' | 'quit'>('list')
  const [shutdownFailed, setShutdownFailed] = useState(false)
  const shuttingDown = useRef(false)
  const gameOpen = useRunning().ids.length > 0
  // Its own sound when it opens (owner decision); going back to the list is not opening it.
  const sounds = useUiSounds()
  useEffect(() => sounds.play('system-menu'), [sounds])

  const shutdown = (): void => {
    if (shuttingDown.current) return
    shuttingDown.current = true
    setShutdownFailed(false)
    window.equon.app
      .shutdown()
      .then(
        (result) => {
          if (result.ok) onClose()
          else setShutdownFailed(true)
        },
        () => setShutdownFailed(true)
      )
      .finally(() => {
        shuttingDown.current = false
      })
  }

  if (step === 'shutdown') {
    const message = shutdownFailed
      ? t.systemMenu.shutdownFailed
      : gameOpen
        ? t.systemMenu.shutdownGameOpen
        : t.systemMenu.shutdownMessage
    return (
      <ConfirmDialog
        id="system-confirm"
        title={t.systemMenu.shutdown}
        message={message}
        confirmLabel={t.systemMenu.shutdownConfirm}
        cancelLabel={t.systemMenu.cancel}
        destructive
        onConfirm={shutdown}
        onCancel={() => {
          setShutdownFailed(false)
          setStep('list')
        }}
      />
    )
  }
  if (step === 'quit') {
    return (
      <ConfirmDialog
        id="system-confirm"
        title={t.systemMenu.quitTitle}
        message={gameOpen ? t.systemMenu.quitGameOpen : t.systemMenu.quitMessage}
        confirmLabel={t.systemMenu.quit}
        cancelLabel={t.systemMenu.cancel}
        onConfirm={() => void window.equon.app.quit()}
        onCancel={() => setStep('list')}
      />
    )
  }
  return <SystemMenuList onClose={onClose} onStep={setStep} />
}

function SystemMenuList({
  onClose,
  onStep
}: {
  onClose: () => void
  onStep: (step: 'shutdown' | 'quit') => void
}): React.JSX.Element {
  const navigation = useNavigation()
  // Unknown until main answers; F11 may have changed it since the last time.
  const [fullscreen, setFullscreen] = useState<boolean | null>(null)
  useEffect(() => {
    void window.equon.app.isFullscreen().then(setFullscreen, () => {})
  }, [])
  useScreenActions({ back: onClose }, true)

  // Opening another screen from these would lose what was not saved yet.
  const unsaved = navigation.route.name === 'gameForm' || navigation.route.name === 'gameArtwork'

  const items: ChoiceItem[] = [
    {
      id: 'fullscreen',
      label: fullscreen ? t.systemMenu.leaveFullscreen : t.systemMenu.enterFullscreen,
      onConfirm:
        fullscreen === null
          ? undefined
          : () => {
              void window.equon.app.toggleFullscreen()
              onClose()
            }
    },
    {
      id: 'settings',
      label: t.settings.title,
      detail: unsaved ? t.systemMenu.settingsUnsaved : undefined,
      onConfirm: unsaved
        ? undefined
        : () => {
            onClose()
            if (navigation.route.name !== 'settings') navigation.openSettings()
          }
    },
    {
      id: 'shutdown',
      label: t.systemMenu.shutdown,
      tone: 'danger',
      onConfirm: () => onStep('shutdown')
    },
    { id: 'quit', label: t.systemMenu.quit, onConfirm: () => onStep('quit') }
  ]

  return (
    <FocusScope id={SYSTEM_MENU_SCOPE}>
      <div className="dialog__backdrop" onClick={onClose} />
      <div className="system-menu" role="dialog" aria-modal="true" aria-label={t.systemMenu.title}>
        <div className="dialog__panel dialog__panel--list">
          {items.map((item, i) => (
            <ChoiceRow key={item.id} dialogId="system-menu" item={item} autoFocus={i === 0} />
          ))}
        </div>
      </div>
    </FocusScope>
  )
}
