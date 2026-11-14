import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import achievementsIcon from '../assets/icons/achievements.svg'
import achievementsSelectedIcon from '../assets/icons/achievements-selected.svg'
import homeIcon from '../assets/icons/home.svg'
import homeSelectedIcon from '../assets/icons/home-selected.svg'
import libraryIcon from '../assets/icons/library.svg'
import librarySelectedIcon from '../assets/icons/library-selected.svg'
import { useNavigation, type Section } from '../app/navigation'
import { formatClock } from '../data/format'
import { ActivityIndicator } from './ActivityIndicator'
import { t } from '../strings'
import './TopBar.css'

const TABS: { section: Section; label: string; icon: string; selectedIcon: string }[] = [
  { section: 'home', label: t.nav.home, icon: homeIcon, selectedIcon: homeSelectedIcon },
  {
    section: 'library',
    label: t.nav.library,
    icon: libraryIcon,
    selectedIcon: librarySelectedIcon
  },
  {
    section: 'achievements',
    label: t.nav.achievements,
    icon: achievementsIcon,
    selectedIcon: achievementsSelectedIcon
  }
]

/**
 * The section the last top bar showed. Each screen draws its own top bar, so a section change
 * mounts a new one; this lets it animate from the tab that was current (owner decision).
 */
let lastSection: Section | null = null

/**
 * Left edge and width of a tab's icon and name, where its underline goes (TopBar.css). Layout
 * offsets, not on-screen boxes: the other tabs are drawn scaled down, but laid out full size.
 */
function contentBox(tab: HTMLElement): { left: number; width: number } | null {
  const icon = tab.querySelector('img')
  const name = tab.querySelector('span')
  if (!icon || !name) return null
  const width = name.offsetLeft + name.offsetWidth - icon.offsetLeft
  if (width <= 0) return null
  return { left: tab.offsetLeft + icon.offsetLeft, width }
}

function Clock(): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(timer)
  }, [])
  return <time className="top-bar__clock">{formatClock(now)}</time>
}

/** Global navigation. Sections change with LB/RB (or Q/E) and by clicking a tab. */
export function TopBar({ active }: { active: Section }): React.JSX.Element {
  const navigation = useNavigation()
  const tabs = useRef(new Map<Section, HTMLButtonElement>())
  // A new section: the underline slides from the previous tab, and both tabs change size, with
  // transforms only (TopBar.css). Same section (coming back from a game page): no animation.
  useLayoutEffect(() => {
    const previous = lastSection
    lastSection = active
    if (previous === null || previous === active) return
    const current = tabs.current.get(active)
    const before = tabs.current.get(previous)
    if (!current || !before) return
    const to = contentBox(current)
    const from = contentBox(before)
    before.dataset.leaving = 'true'
    current.dataset.entering = 'true'
    if (!to || !from) return
    current.style.setProperty('--underline-from-x', `${from.left - to.left}px`)
    current.style.setProperty('--underline-from-scale', String(from.width / to.width))
  }, [active])
  return (
    <header className="top-bar">
      <ActivityIndicator className="top-bar__activity" />
      <nav className="top-bar__tabs" aria-label="Navegação principal">
        {TABS.map((tab) => {
          const selected = tab.section === active
          return (
            <button
              key={tab.section}
              ref={(element) => {
                if (element) tabs.current.set(tab.section, element)
                else tabs.current.delete(tab.section)
              }}
              className="top-bar__tab"
              data-selected={selected}
              aria-current={selected ? 'page' : undefined}
              tabIndex={-1}
              onClick={() => navigation.goToSection(tab.section)}
            >
              <img src={selected ? tab.selectedIcon : tab.icon} alt="" />
              <span data-label={tab.label}>{tab.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="top-bar__end">
        <Clock />
      </div>
    </header>
  )
}
