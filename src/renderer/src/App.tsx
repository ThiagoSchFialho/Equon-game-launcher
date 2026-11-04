import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  NavigationContext,
  currentSection,
  emulatorsRoute,
  isSectionRoute,
  settingsRoute,
  formRoute,
  previousRoute,
  stepSection,
  type Navigation,
  type Route
} from './app/navigation'
import { DEFAULT_LIBRARY_VIEW, type LibraryView } from '../../shared/library-view'
import { GamesContext, useGamesLoader } from './data/games'
import { LibraryViewContext, type LibraryViewState } from './data/library-view'
import { RunningContext, useRunningLoader } from './data/running'
import { FocusManager } from './focus/focus-manager'
import { FocusProvider } from './focus/FocusProvider'
import { useInput } from './input/useInput'
import { AchievementsScreen } from './screens/AchievementsScreen'
import { EmulatorsScreen } from './screens/EmulatorsScreen'
import { GameDetailsScreen } from './screens/GameDetailsScreen'
import { GameFormScreen } from './screens/GameFormScreen'
import { HomeScreen } from './screens/HomeScreen'
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
    case 'emulators':
      return <EmulatorsScreen />
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
  // Steam scans (startup, "Atualizar biblioteca") add or change games.
  useEffect(() => window.equon.library.onChanged(games.refresh), [games.refresh])

  const dispatch = useCallback(
    (action: Parameters<FocusManager['handle']>[0]) => {
      manager.handle(action)
    },
    [manager]
  )
  useInput(dispatch)

  const navigation = useMemo<Navigation>(
    () => ({
      route,
      goToSection: (section) => setRoute({ name: section }),
      openGame: (id) => setRoute((r) => ({ name: 'game', id, from: currentSection(r) })),
      openGameForm: (id) => setRoute((r) => formRoute(r, id)),
      openEmulators: () => setRoute(emulatorsRoute),
      openSettings: () => setRoute(settingsRoute),
      back: () => setRoute(previousRoute),
      // Sections only change from the section screens themselves.
      stepSection: (delta) =>
        setRoute((r) => (isSectionRoute(r) ? { name: stepSection(r.name, delta) } : r))
    }),
    [route]
  )

  return (
    <FocusProvider manager={manager}>
      <NavigationContext.Provider value={navigation}>
        <GamesContext.Provider value={games}>
          <RunningContext.Provider value={running}>
            <LibraryViewContext.Provider value={libraryViewState}>
              <CurrentScreen route={route} />
            </LibraryViewContext.Provider>
          </RunningContext.Provider>
        </GamesContext.Provider>
      </NavigationContext.Provider>
    </FocusProvider>
  )
}

export default App
