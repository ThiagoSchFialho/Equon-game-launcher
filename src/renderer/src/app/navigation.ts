import { createContext, useContext } from 'react'

export type Section = 'home' | 'library' | 'achievements'

export const SECTIONS: readonly Section[] = ['home', 'library', 'achievements']

type ScreenRoute = { name: Section } | { name: 'game'; id: number; from: Section }

export type Route =
  | ScreenRoute
  /** Add (id null) or edit form; `previous` is where Cancel/back returns. */
  | { name: 'gameForm'; id: number | null; previous: ScreenRoute }
  /** "Editar artes", from the game's options menu. */
  | { name: 'gameArtwork'; id: number; previous: ScreenRoute }
  /** One game's achievements, from the overview or the game's options menu. */
  | { name: 'gameAchievements'; id: number; previous: ScreenRoute }
  /** Settings, opened from the gear in the top bar. */
  | { name: 'settings'; previous: ScreenRoute }

/** Screens opened on top of a section; back returns to `previous`. */
type SubRoute = Extract<Route, { previous: ScreenRoute }>

const isSubRoute = (route: Route): route is SubRoute => 'previous' in route

export interface Navigation {
  route: Route
  /** Switch to a top-level section (clears the screen stack). */
  goToSection(section: Section): void
  openGame(id: number): void
  openGameForm(id: number | null): void
  openSettings(): void
  openGameAchievements(id: number): void
  openGameArtwork(id: number): void
  /** Go back one screen; no-op at a top-level section. */
  back(): void
  /** LB/RB: move to the neighbouring section without wrapping around. */
  stepSection(delta: -1 | 1): void
}

export const NavigationContext = createContext<Navigation | null>(null)

export function useNavigation(): Navigation {
  const navigation = useContext(NavigationContext)
  if (!navigation) throw new Error('useNavigation must be used inside the app navigation provider')
  return navigation
}

export function currentSection(route: Route): Section {
  if (route.name === 'game') return route.from
  if (isSubRoute(route)) return currentSection(route.previous)
  return route.name
}

/** Pure section stepping (no wrap-around, DESIGN_SYSTEM.md §4 "evitar ciclos inesperados"). */
/** Whether LB (-1) or RB (1) leads anywhere from this section: not past either end. */
export function hasSection(section: Section, delta: -1 | 1): boolean {
  const index = SECTIONS.indexOf(section) + delta
  return index >= 0 && index < SECTIONS.length
}

export function stepSection(section: Section, delta: -1 | 1): Section {
  const index = SECTIONS.indexOf(section) + delta
  return SECTIONS[Math.min(SECTIONS.length - 1, Math.max(0, index))]
}

/** Route after "back". */
export function previousRoute(route: Route): Route {
  if (route.name === 'game') return { name: route.from }
  if (isSubRoute(route)) return route.previous
  return route
}

/** The screen a sub-screen returns to (sub-screens are never a "previous"). */
function screenOf(route: Route): ScreenRoute {
  return isSubRoute(route) ? route.previous : route
}

/** Route that opens the add/edit form from `route`. */
export function formRoute(route: Route, id: number | null): Route {
  return { name: 'gameForm', id, previous: screenOf(route) }
}

/** Route that opens one game's achievements from `route`. */
export function gameAchievementsRoute(route: Route, id: number): Route {
  return { name: 'gameAchievements', id, previous: screenOf(route) }
}

/** Route that opens "Editar artes" from `route`. */
export function gameArtworkRoute(route: Route, id: number): Route {
  return { name: 'gameArtwork', id, previous: screenOf(route) }
}

/** Route that opens the settings from `route`. */
export function settingsRoute(route: Route): Route {
  return { name: 'settings', previous: screenOf(route) }
}

/** True on the section screens, where LB/RB switch sections. */
export function isSectionRoute(route: Route): route is { name: Section } {
  return route.name !== 'game' && !isSubRoute(route)
}
