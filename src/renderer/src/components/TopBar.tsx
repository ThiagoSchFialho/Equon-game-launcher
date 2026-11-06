import { useEffect, useState } from 'react'
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
  return (
    <header className="top-bar">
      <ActivityIndicator className="top-bar__activity" />
      <nav className="top-bar__tabs" aria-label="Navegação principal">
        {TABS.map((tab) => {
          const selected = tab.section === active
          return (
            <button
              key={tab.section}
              className="top-bar__tab"
              data-selected={selected}
              aria-current={selected ? 'page' : undefined}
              tabIndex={-1}
              onClick={() => navigation.goToSection(tab.section)}
            >
              <img src={selected ? tab.selectedIcon : tab.icon} alt="" />
              <span>{tab.label}</span>
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
