import { createContext, useContext } from 'react'

export type Section = 'home' | 'library' | 'achievements'

export const SECTIONS: readonly Section[] = ['home', 'library', 'achievements']

export type Route = { name: Section } | { name: 'game'; id: number; from: Section }

export interface Navigation {
  route: Route
  /** Switch to a top-level section (clears the screen stack). */
  goToSection(section: Section): void
  openGame(id: number): void
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
  return route.name === 'game' ? route.from : route.name
}

/** Pure section stepping (no wrap-around, DESIGN_SYSTEM.md §4 "evitar ciclos inesperados"). */
export function stepSection(section: Section, delta: -1 | 1): Section {
  const index = SECTIONS.indexOf(section) + delta
  return SECTIONS[Math.min(SECTIONS.length - 1, Math.max(0, index))]
}
