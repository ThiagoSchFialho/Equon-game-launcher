import type { GameSummary } from '../../../../shared/ipc/contract'
import settingsBackground from '../../assets/backgrounds/settings.png'
import libraryIcon from '../../assets/icons/library.svg'
import settingsIcon from '../../assets/icons/settings.svg'
import { useNavigation } from '../../app/navigation'
import { useFocusManager } from '../../focus/focus-context'
import { t } from '../../strings'
import { CoverShelf } from './CoverShelf'
import { GameSpotlight, SPOTLIGHT_PREFIX } from './GameSpotlight'
import { QUICK_PREFIX, QuickSettings } from './QuickSettings'

const SHORTCUT_ID = 'home:settings'
export const SHOW_ALL_ID = 'home:show-all'
export const SHOW_LESS_ID = 'home:show-less'

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
  backdropTarget,
  onPanelGame,
  more
}: {
  games: GameSummary[]
  onOpen: (game: GameSummary) => void
  opensToPlay: boolean
  onMenu: (game: GameSummary) => void
  backdropTarget: HTMLElement | null
  /** The game the panel shows (GameSpotlight), or null with none. */
  onPanelGame?: (game: GameSummary | null) => void
  /**
   * After the last cover, with the limit on: "Mostrar todos os jogos" while some games are left
   * out, "Mostrar menos" once they all show. One item, so the focus stays on it either way.
   */
  more?: { expanded: boolean; onConfirm: () => void }
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
        id: SHORTCUT_ID,
        label: t.settings.title,
        icon: settingsIcon,
        // The owner's image behind the Home while the shortcut is focused (D-32).
        art: settingsBackground,
        onConfirm: () => navigation.openSettings(),
        // Into the quick settings (D-33); it always stays on the shelf otherwise.
        onDown: () => {
          manager.focus(`${QUICK_PREFIX}0`)
          return true
        }
      }}
      // After the last game, styled like the Settings shortcut (owner decision).
      trailing={
        more
          ? {
              id: more.expanded ? SHOW_LESS_ID : SHOW_ALL_ID,
              kind: more.expanded ? 'less' : 'more',
              label: more.expanded ? t.home.showLess : t.home.showAll,
              icon: libraryIcon,
              onConfirm: more.onConfirm
            }
          : undefined
      }
      below={({ game, hidden, cardId, leadingFocused }) =>
        leadingFocused ? (
          <QuickSettings shortcutId={SHORTCUT_ID} hidden={hidden} />
        ) : (
          <GameSpotlight
            game={game}
            hidden={hidden}
            cardId={cardId}
            onOpenAchievements={(target) => navigation.openGameAchievements(target.id)}
            onShown={onPanelGame}
          />
        )
      }
    />
  )
}
