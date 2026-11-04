import { useState } from 'react'
import type { GameSummary } from '../../../shared/ipc/contract'
import { useNavigation } from '../app/navigation'
import { useGames } from '../data/games'
import { useRunning } from '../data/running'
import { t } from '../strings'
import { ConfirmDialog } from './Dialog'
import { OptionsMenu } from './OptionsMenu'
import { SteamGridDbSearch } from './SteamGridDbSearch'

/**
 * Options menu for a game card (Home, Library): zerado/oculto for every
 * game; edit and remove for non-Steam games, with a confirmation before removing.
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
  const [searching, setSearching] = useState(false)
  const editable = game.origin !== 'steam'

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
  if (searching) {
    return (
      <SteamGridDbSearch
        gameId={game.id}
        title={game.title}
        onClose={onClose}
        onApplied={refresh}
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
      onEdit={editable ? () => navigation.openGameForm(game.id) : undefined}
      onArtwork={editable ? () => setSearching(true) : undefined}
      onRemove={editable && !running ? () => setConfirming(true) : undefined}
    />
  )
}
