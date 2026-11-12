import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LibraryRefreshInfo } from '../../../../shared/ipc/contract'
import fullscreenIcon from '../../assets/icons/quick-fullscreen.svg'
import limitIcon from '../../assets/icons/quick-limit.svg'
import playIcon from '../../assets/icons/quick-play.svg'
import refreshIcon from '../../assets/icons/quick-refresh.svg'
import { useHomeCovers } from '../../data/home-covers'
import { useHomeLaunch } from '../../data/home-launch'
import { clockTime, refreshText } from '../../data/library-refresh'
import { useGames } from '../../data/games'
import { useFocusable, useFocusManager, useScreenActions } from '../../focus/focus-context'
import type { Direction } from '../../input/actions'
import { t } from '../../strings'
import './QuickSettings.css'

export const QUICK_PREFIX = 'quick:'
const itemId = (index: number): string => `${QUICK_PREFIX}${index}`

interface Item {
  label: string
  icon: string
  /** "Ligado"/"Desligado", or the result of the last run. */
  state: string
  onConfirm: () => void
}

/**
 * "Em cima"'s quick settings (owner decision, D-33), under the shelf while the Settings shortcut
 * is focused: a few options of Configurações, changed at once without leaving Home. Down on the
 * shortcut enters the row, left and right walk it, up or B go back to the shortcut, A changes the
 * option. They are the same settings, saved the same way.
 */
export function QuickSettings({
  shortcutId,
  hidden
}: {
  /** The Settings shortcut, where up and B go back to. */
  shortcutId: string
  hidden: boolean
}): React.JSX.Element {
  const manager = useFocusManager()
  const focusedId = useSyncExternalStore(manager.subscribe, () => manager.focusedId)
  const inPanel = focusedId?.startsWith(QUICK_PREFIX) ?? false
  useScreenActions({ back: inPanel ? () => manager.focus(shortcutId) : undefined })

  const homeLaunch = useHomeLaunch()
  const homeCovers = useHomeCovers()
  const { refresh: refreshGames } = useGames()
  const [lastRefresh, setLastRefresh] = useState<LibraryRefreshInfo | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [fullscreen, setFullscreen] = useState<boolean | null>(null)
  useEffect(() => {
    void window.equon.settings.get().then(
      (info) => {
        setLastRefresh(info.lastRefresh)
        setRefreshing(info.refreshing)
      },
      () => {}
    )
    void window.equon.app.isFullscreen().then(setFullscreen, () => {})
  }, [])

  const onOff = (on: boolean): string => (on ? t.home.quick.on : t.home.quick.off)
  const items: Item[] = [
    {
      label: t.settings.refresh,
      icon: refreshIcon,
      state: refreshing
        ? t.settings.refreshing
        : // Short here (owner decision): only when; Settings › Conexões says what changed.
          lastRefresh?.status === 'complete'
          ? t.home.quick.refreshedAt(clockTime(lastRefresh.finishedAt))
          : refreshText(lastRefresh),
      onConfirm: () => {
        if (refreshing) return
        setRefreshing(true)
        void window.equon.library
          .refresh()
          .then(setLastRefresh, () => {})
          .finally(() => {
            setRefreshing(false)
            refreshGames()
          })
      }
    },
    {
      label: t.home.quick.fullscreen,
      icon: fullscreenIcon,
      state: fullscreen === null ? '' : onOff(fullscreen),
      onConfirm: () => void window.equon.app.toggleFullscreen().then(setFullscreen, () => {})
    },
    {
      label: t.settings.system.homeDirectLaunch,
      icon: playIcon,
      state: onOff(homeLaunch.directLaunch),
      onConfirm: () =>
        void window.equon.settings.setHomeDirectLaunch(!homeLaunch.directLaunch).then(
          (result) => result.ok && homeLaunch.set(result.data.homeDirectLaunch),
          () => {}
        )
    },
    {
      label: t.home.quick.limitGames,
      icon: limitIcon,
      state: onOff(homeCovers.settings.limited),
      onConfirm: () =>
        void window.equon.settings.setHomeCovers({ limited: !homeCovers.settings.limited }).then(
          (result) => result.ok && homeCovers.set(result.data.homeCovers),
          () => {}
        )
    }
  ]

  const step = (index: number, direction: Direction): boolean => {
    if (direction === 'up') manager.focus(shortcutId)
    else if (direction === 'left' && index > 0) manager.focus(itemId(index - 1))
    else if (direction === 'right' && index + 1 < items.length) manager.focus(itemId(index + 1))
    else if (direction === 'down') return false
    return true
  }

  return (
    <section className="home-quick" data-hidden={hidden} aria-label={t.home.quick.title}>
      <h2 className="home-quick__title">{t.home.quick.title}</h2>
      <div className="home-quick__row">
        {items.map((item, i) => (
          <QuickItem
            key={item.label}
            id={itemId(i)}
            item={item}
            onDirection={(direction) => step(i, direction)}
          />
        ))}
      </div>
    </section>
  )
}

function QuickItem({
  id,
  item,
  onDirection
}: {
  id: string
  item: Item
  onDirection: (direction: Direction) => boolean
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    onConfirm: item.onConfirm,
    onDirection,
    scroll: 'none'
  })
  return (
    <button
      ref={setElement}
      className="home-quick__item"
      data-focused={focused}
      aria-label={item.label}
      aria-description={item.state || undefined}
      tabIndex={-1}
      {...mouse}
    >
      <img className="home-quick__icon" src={item.icon} alt="" />
      <span className="home-quick__text">
        <span className="home-quick__name">{item.label}</span>
        <span className="home-quick__state">{item.state}</span>
      </span>
    </button>
  )
}
