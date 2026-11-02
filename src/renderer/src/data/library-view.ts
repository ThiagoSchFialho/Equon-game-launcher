import { createContext, useContext } from 'react'
import type { LibraryView } from '../../../shared/library-view'

export interface LibraryViewState {
  view: LibraryView
  setView(update: (view: LibraryView) => LibraryView): void
}

/**
 * Library search, filters and sorting, held by the app so they survive
 * navigation; in memory only, so a restart brings back the defaults.
 */
export const LibraryViewContext = createContext<LibraryViewState | null>(null)

export function useLibraryView(): LibraryViewState {
  const state = useContext(LibraryViewContext)
  if (!state) throw new Error('useLibraryView must be used inside the library view provider')
  return state
}
