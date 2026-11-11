import { useState } from 'react'
import type { GameSummary } from '../../../shared/ipc/contract'
import { useNavigation } from '../app/navigation'
import { useGames } from '../data/games'
import { useRunning } from '../data/running'
import { t } from '../strings'
import { OptionsMenu } from './OptionsMenu'
import { RemoveGameDialog } from './RemoveGameDialog'

/**
 * Options menu for a game card (Home, Library): zerado/oculto and edit for every game (a Steam
 * game edits only its details); remove, with a confirmation (a Steam game may become an exception,
 * D-26); uninstall for installed Steam games, where Steam asks for the confirmation.
 */
export function GameOptionsLayer({
  game,
  onOpenPage,
  onClose
}: {
  game: GameSummary
  /** "Ver página do jogo": on Home when A starts the game instead (D-28). */
  onOpenPage?: () => void
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
      <RemoveGameDialog
        game={game}
        onCancel={() => setConfirming(false)}
        onRemoved={() => {
          reload()
          onClose()
        }}
        onFailed={() => {
          setMessage(t.remove.failed)
          setConfirming(false)
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
      onOpenPage={onOpenPage}
      onAchievements={() => navigation.openGameAchievements(game.id)}
      onEdit={() => navigation.openGameForm(game.id)}
      onEditArtwork={() => navigation.openGameArtwork(game.id)}
      onRemove={!running ? () => setConfirming(true) : undefined}
      onUninstall={steam && game.installed === true && !running ? uninstall : undefined}
      message={message}
    />
  )
}
