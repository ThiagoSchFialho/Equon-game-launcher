import type { GameSummary } from '../../../../shared/ipc/contract'
import settingsIcon from '../../assets/icons/settings.svg'
import { useNavigation } from '../../app/navigation'
import { useFocusManager } from '../../focus/focus-context'
import { t } from '../../strings'
import { CoverShelf } from './CoverShelf'
import { GameSpotlight, SPOTLIGHT_PREFIX } from './GameSpotlight'

/**
 * "Capas da home" › Em cima (D-27, D-29): the shelf by the top bar, with the focused game's panel
 * under it, and a shortcut to Settings before the first game (D-32). Down on the focused cover
 * enters the panel; up, or B, comes back to that cover (GameSpotlight.tsx).
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

  // Into the panel: its first achievement, or "Ver todas" when there is none. With no panel to
  // enter, down does nothing: the focus never wanders off to another cover.
  const enterPanel = (): boolean => {
    for (const id of [`${SPOTLIGHT_PREFIX}tile:0`, `${SPOTLIGHT_PREFIX}all`]) {
      manager.focus(id)
      if (manager.focusedId === id) return true
    }
    return true
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
      // A shortcut to Settings before the first game (owner decision, D-32).
      leading={{
        id: 'home:settings',
        label: t.settings.title,
        icon: settingsIcon,
        onConfirm: () => navigation.openSettings()
      }}
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
