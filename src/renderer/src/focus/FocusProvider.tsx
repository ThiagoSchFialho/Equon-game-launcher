import { useLayoutEffect, type ReactNode } from 'react'
import { ManagerContext, ScopeContext, useFocusManager } from './focus-context'
import type { FocusManager } from './focus-manager'

export function FocusProvider({
  manager,
  children
}: {
  manager: FocusManager
  children: ReactNode
}): React.JSX.Element {
  return <ManagerContext.Provider value={manager}>{children}</ManagerContext.Provider>
}

/** A focus scope (a screen or a dialog). The most recently mounted scope is active. */
export function FocusScope({
  id,
  children
}: {
  id: string
  children: ReactNode
}): React.JSX.Element {
  const manager = useFocusManager()
  useLayoutEffect(() => {
    manager.pushScope(id)
    return () => manager.popScope(id)
  }, [manager, id])
  return <ScopeContext.Provider value={id}>{children}</ScopeContext.Provider>
}
