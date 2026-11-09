import { useState } from 'react'
import type { IgnoredSteamGameInfo } from '../../../shared/ipc/contract'
import { t } from '../strings'
import { ChoiceDialog, ConfirmDialog } from './Dialog'

/**
 * The Steam exceptions (D-26): picking a game asks before taking it off the list; it comes back
 * on the user's next "Atualizar biblioteca".
 */
export function IgnoredSteamGamesDialog({
  games,
  onChanged,
  onClose
}: {
  games: readonly IgnoredSteamGameInfo[]
  /** The list must be read again. */
  onChanged: () => void
  onClose: () => void
}): React.JSX.Element {
  const [confirming, setConfirming] = useState<IgnoredSteamGameInfo | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const unignore = (game: IgnoredSteamGameInfo): void => {
    void window.equon.library.unignore(game.steamAppId).then(
      (result) => {
        setMessage(result.ok ? null : t.ignored.failed)
        setConfirming(null)
        onChanged()
      },
      () => {
        setMessage(t.ignored.failed)
        setConfirming(null)
      }
    )
  }

  // One dialog at a time: the confirmation takes the list's place, so the titles never overlap.
  if (confirming) {
    return (
      <ConfirmDialog
        id="unignore-steam"
        title={t.ignored.confirmTitle(confirming.title)}
        message={t.ignored.confirmMessage}
        confirmLabel={t.ignored.confirm}
        cancelLabel={t.ignored.cancel}
        onCancel={() => setConfirming(null)}
        onConfirm={() => unignore(confirming)}
      />
    )
  }
  return (
    <ChoiceDialog
      id="ignored-steam"
      title={t.ignored.title}
      width="wide"
      onClose={onClose}
      footer={
        <p className="dialog__message" role={message ? 'alert' : undefined}>
          {message ?? t.ignored.message}
        </p>
      }
      items={[
        ...games.map((game) => ({
          id: `game-${game.steamAppId}`,
          label: game.title,
          onConfirm: () => setConfirming(game)
        })),
        { id: 'close', label: t.ignored.close, onConfirm: onClose, separated: true }
      ]}
    />
  )
}
