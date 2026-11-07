import { useState } from 'react'
import type { GameSummary } from '../../../shared/ipc/contract'
import { useNavigation } from '../app/navigation'
import { useGames } from '../data/games'
import { useRunning } from '../data/running'
import { t } from '../strings'
import { ConfirmDialog } from './Dialog'
import { OptionsMenu } from './OptionsMenu'

/**
 * Options menu for a game card (Home, Library): zerado/oculto and edit for every game (a Steam
 * game edits only its details); remove for non-Steam games, with a confirmation; uninstall for
 * installed Steam games, where Steam asks for the confirmation.
 */
export function GameOptionsLayer({
  game,
  onClose
}: {
  game: GameSummary
  onClose: () => void
}): React.JSX.Element {
  const navigation = useNavigation()
  const { reload, refresh } = useGames()
  const running = useRunning().ids.includes(game.id)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const steam = game.origin === 'steam'
  const uninstall = (): void => {
    void window.equon.games.uninstallSteam(game.id).then(
      (result) => {
        if (result.ok) onClose()
        else setMessage(t.game.steamOpenFailed)
      },
      () => setMessage(t.game.steamOpenFailed)
    )
  }

  if (confirming) {
    return (
      <ConfirmDialog
        title={t.remove.title(game.title)}
        message={t.remove.message}
        confirmLabel={t.remove.confirm}
        cancelLabel={t.remove.cancel}
        destructive
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          void window.equon.games.remove(game.id).then(() => {
            reload()
            onClose()
          })
        }}
      />
    )
  }
  return (
    <OptionsMenu
      title={game.title}
      beated={game.beated}
      hidden={game.hidden}
      onFlags={(flags) => {
        // The list reloads either way; a failure leaves the flag as it was.
        void window.equon.games.setFlags(game.id, flags).finally(() => {
          refresh()
          onClose()
        })
      }}
      onClose={onClose}
      onAchievements={() => navigation.openGameAchievements(game.id)}
      onEdit={() => navigation.openGameForm(game.id)}
      onEditArtwork={() => navigation.openGameArtwork(game.id)}
      onRemove={!steam && !running ? () => setConfirming(true) : undefined}
      onUninstall={steam && game.installed === true && !running ? uninstall : undefined}
      message={message}
    />
  )
}
