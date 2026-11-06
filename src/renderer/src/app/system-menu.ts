import { createContext, useContext } from 'react'

export interface SystemMenuState {
  open: boolean
  toggle: () => void
}

export const SystemMenuContext = createContext<SystemMenuState>({ open: false, toggle: () => {} })

export function useSystemMenu(): SystemMenuState {
  return useContext(SystemMenuContext)
}
