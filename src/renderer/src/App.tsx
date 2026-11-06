import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  NavigationContext,
  currentSection,
  isSectionRoute,
  settingsRoute,
  formRoute,
  gameAchievementsRoute,
  gameArtworkRoute,
  previousRoute,
  stepSection,
  type Navigation,
  type Route
} from './app/navigation'
import { DEFAULT_LIBRARY_VIEW, type LibraryView } from '../../shared/library-view'
import type { AchievementSort } from '../../shared/achievements-view'
import { SystemMenuContext, type SystemMenuState } from './app/system-menu'
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary'
import { SYSTEM_MENU_SCOPE, SystemMenu } from './components/SystemMenu'
import { AchievementSortContext, type AchievementSortState } from './data/achievements'
import { BackgroundActivityContext, useBackgroundActivityLoader } from './data/background-activity'
import { GamesContext, useGamesLoader } from './data/games'
import { LibraryViewContext, type LibraryViewState } from './data/library-view'
import { RunningContext, useRunningLoader } from './data/running'
import { FocusManager } from './focus/focus-manager'
import { FocusProvider } from './focus/FocusProvider'
import { useInput } from './input/useInput'
import { AchievementsScreen } from './screens/AchievementsScreen'
import { GameAchievementsScreen } from './screens/GameAchievementsScreen'
import { GameDetailsScreen } from './screens/GameDetailsScreen'
import { GameFormScreen } from './screens/GameFormScreen'
import { HomeScreen } from './screens/HomeScreen'
import { GameArtworkScreen } from './screens/GameArtworkScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import './screens/Screen.css'

function CurrentScreen({ route }: { route: Route }): React.JSX.Element {
  switch (route.name) {
    case 'home':
      return <HomeScreen />
    case 'library':
      return <LibraryScreen />
    case 'achievements':
      return <AchievementsScreen />
    case 'game':
      return <GameDetailsScreen key={route.id} id={route.id} from={route.from} />
    case 'gameForm':
      return <GameFormScreen key={route.id ?? 'new'} id={route.id} />
    case 'gameArtwork':
      return <GameArtworkScreen key={route.id} id={route.id} />
    case 'gameAchievements':
      return <GameAchievementsScreen key={route.id} id={route.id} />
    case 'settings':
      return <SettingsScreen />
  }
}

function App(): React.JSX.Element {
  const [manager] = useState(() => new FocusManager())
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const games = useGamesLoader()
  // Survives navigation, resets on restart (PRODUCT.md §6.4).
  const [libraryView, setLibraryView] = useState<LibraryView>(DEFAULT_LIBRARY_VIEW)
  const libraryViewState = useMemo<LibraryViewState>(
    () => ({ view: libraryView, setView: setLibraryView }),
    [libraryView]
  )
  // A game that stops has new playtime and last-played values; refresh keeps focus in place.
  const running = useRunningLoader(games.refresh)
  const [achievementSort, setAchievementSort] = useState<AchievementSort>('recent')
  const achievementSortState = useMemo<AchievementSortState>(
    () => ({ sort: achievementSort, setSort: setAchievementSort }),
    [achievementSort]
  )
  const activity = useBackgroundActivityLoader()
  // Steam scans (startup, "Atualizar biblioteca") add or change games.
  useEffect(() => window.equon.library.onChanged(games.refresh), [games.refresh])

  const [systemMenuOpen, setSystemMenuOpen] = useState(false)
  const toggleSystemMenu = useCallback(() => {
    // Every opening starts at the first item.
    manager.forgetFocus(SYSTEM_MENU_SCOPE)
    setSystemMenuOpen((open) => !open)
  }, [manager])
  const systemMenu = useMemo<SystemMenuState>(
    () => ({ open: systemMenuOpen, toggle: toggleSystemMenu }),
    [systemMenuOpen, toggleSystemMenu]
  )

  const dispatch = useCallback(
    (action: Parameters<FocusManager['handle']>[0]) => {
      // Above everything: it also opens over a dialog, which would stop the action.
      if (action === 'system') toggleSystemMenu()
      else manager.handle(action)
    },
    [manager, toggleSystemMenu]
  )
  useInput(dispatch)

  const navigation = useMemo<Navigation>(
    () => ({
      route,
      goToSection: (section) => {
        manager.forgetAllFocus()
        setRoute({ name: section })
      },
      // Going forward starts at the first item; back (below) returns to where it was.
      openGame: (id) => {
        manager.forgetFocus(`screen:game:${id}`)
        setRoute((r) => ({ name: 'game', id, from: currentSection(r) }))
      },
      openGameForm: (id) => {
        manager.forgetFocus('screen:game-form')
        setRoute((r) => formRoute(r, id))
      },
      openSettings: () => {
        manager.forgetFocus('screen:settings')
        setRoute(settingsRoute)
      },
      openGameAchievements: (id) => {
        manager.forgetFocus(`screen:game-achievements:${id}`)
        setRoute((r) => gameAchievementsRoute(r, id))
      },
      openGameArtwork: (id) => {
        manager.forgetFocus('screen:game-artwork')
        setRoute((r) => gameArtworkRoute(r, id))
      },
      back: () => setRoute(previousRoute),
      // Sections only change from the section screens themselves.
      stepSection: (delta) => {
        // Outside a section nothing changes, so the list below keeps its focus for "back".
        if (!isSectionRoute(route)) return
        manager.forgetAllFocus()
        setRoute((r) => (isSectionRoute(r) ? { name: stepSection(r.name, delta) } : r))
      }
    }),
    [route, manager]
  )

  return (
    <FocusProvider manager={manager}>
      <NavigationContext.Provider value={navigation}>
        <GamesContext.Provider value={games}>
          <RunningContext.Provider value={running}>
            <LibraryViewContext.Provider value={libraryViewState}>
              <AchievementSortContext.Provider value={achievementSortState}>
                <BackgroundActivityContext.Provider value={activity}>
                  <SystemMenuContext.Provider value={systemMenu}>
                    <ScreenErrorBoundary key={JSON.stringify(route)}>
                      <CurrentScreen route={route} />
                    </ScreenErrorBoundary>
                    {systemMenuOpen && <SystemMenu onClose={() => setSystemMenuOpen(false)} />}
                  </SystemMenuContext.Provider>
                </BackgroundActivityContext.Provider>
              </AchievementSortContext.Provider>
            </LibraryViewContext.Provider>
          </RunningContext.Provider>
        </GamesContext.Provider>
      </NavigationContext.Provider>
    </FocusProvider>
  )
}

export default App
