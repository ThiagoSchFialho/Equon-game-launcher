import type { GameSummary } from '../../../../shared/ipc/contract'
import { useNavigation } from '../../app/navigation'
import { useFocusManager } from '../../focus/focus-context'
import { CoverShelf } from './CoverShelf'
import { GameSpotlight, SPOTLIGHT_PREFIX } from './GameSpotlight'

/**
 * "Capas da home" › Em cima (D-27, D-29): the shelf by the top bar, with the focused game's panel
 * under it. Down on the focused cover enters the panel; up, or B, comes back to that cover
 * (GameSpotlight.tsx).
 */
export function TopHome({
  games,
  onOpen,
  opensToPlay,
  onMenu,
  backdropTarget
}: {
  games: GameSummary[]
  onOpen: (game: GameSummary) => void
  opensToPlay: boolean
  onMenu: (game: GameSummary) => void
  backdropTarget: HTMLElement | null
}): React.JSX.Element {
  const navigation = useNavigation()
  const manager = useFocusManager()

  // Into the panel: its first achievement, or "Ver todas" when there is none.
  const enterPanel = (): boolean => {
    for (const id of [`${SPOTLIGHT_PREFIX}tile:0`, `${SPOTLIGHT_PREFIX}all`]) {
      manager.focus(id)
      if (manager.focusedId === id) return true
    }
    return false
  }

  return (
    <CoverShelf
      side="top"
      games={games}
      onOpen={onOpen}
      opensToPlay={opensToPlay}
      onMenu={onMenu}
      backdropTarget={backdropTarget}
      onCardDown={enterPanel}
      below={({ game, hidden, cardId }) => (
        <GameSpotlight
          game={game}
          hidden={hidden}
          cardId={cardId}
          onOpenAchievements={(target) => navigation.openGameAchievements(target.id)}
        />
      )}
    />
  )
}
