import { useCallback, useMemo, useState } from 'react'
import {
  NavigationContext,
  currentSection,
  emulatorsRoute,
  formRoute,
  previousRoute,
  stepSection,
  type Navigation,
  type Route
} from './app/navigation'
import { GamesContext, useGamesLoader } from './data/games'
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
  }
}

function App(): React.JSX.Element {
  const [manager] = useState(() => new FocusManager())
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const games = useGamesLoader()
  // A game that stops has new playtime and last-played values.
  const running = useRunningLoader(games.reload)

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
      back: () => setRoute(previousRoute),
      // Sections only change from the section screens themselves.
      stepSection: (delta) =>
        setRoute((r) =>
          r.name === 'game' || r.name === 'gameForm' || r.name === 'emulators'
            ? r
            : { name: stepSection(r.name, delta) }
        )
    }),
    [route]
  )

  return (
    <FocusProvider manager={manager}>
      <NavigationContext.Provider value={navigation}>
        <GamesContext.Provider value={games}>
          <RunningContext.Provider value={running}>
            <CurrentScreen route={route} />
          </RunningContext.Provider>
        </GamesContext.Provider>
      </NavigationContext.Provider>
    </FocusProvider>
  )
}

export default App
