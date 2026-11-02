import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore
} from 'react'
import type { FocusManager, FocusableOptions, ScreenActions } from './focus-manager'

export const ManagerContext = createContext<FocusManager | null>(null)
export const ScopeContext = createContext<string | null>(null)

export function useFocusManager(): FocusManager {
  const manager = useContext(ManagerContext)
  if (!manager) throw new Error('useFocusManager must be used inside <FocusProvider>')
  return manager
}

export interface Focusable<T extends HTMLElement> {
  /** Pass as the element's `ref`. */
  setElement: (el: T | null) => void
  focused: boolean
  /** Mouse support: click focuses and confirms, right click opens the menu. */
  mouse: {
    onClick: () => void
    onContextMenu: (event: React.MouseEvent) => void
  }
}

/** Registers an element with the focus manager. `id` must be unique while mounted. */
export function useFocusable<T extends HTMLElement = HTMLElement>(
  id: string,
  options: FocusableOptions = {}
): Focusable<T> {
  const manager = useFocusManager()
  const scope = useContext(ScopeContext)
  if (scope === null) throw new Error('useFocusable must be used inside <FocusScope>')

  const setElement = useCallback(
    (el: T | null) => {
      if (el) manager.register(id, scope, el)
      else manager.unregister(id)
    },
    [manager, id, scope]
  )
  // Runs in the same commit as the ref above, before the manager picks a focus target.
  useLayoutEffect(() => manager.update(id, options))

  const focused = useSyncExternalStore(manager.subscribe, () => manager.focusedId === id)

  return {
    setElement,
    focused,
    mouse: {
      onClick: () => manager.activate(id),
      onContextMenu: (event) => {
        event.preventDefault()
        manager.openMenu(id)
      }
    }
  }
}

/** Screen-level handlers for back, menu, sections and scroll. `modal` blocks layers below. */
export function useScreenActions(handlers: ScreenActions, modal = false): void {
  const manager = useFocusManager()
  const keyRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    const key = manager.pushHandlers({}, modal)
    keyRef.current = key
    return () => manager.popHandlers(key)
  }, [manager, modal])
  useLayoutEffect(() => {
    if (keyRef.current !== null) manager.updateHandlers(keyRef.current, handlers)
  })
}

/** Unique-per-instance id helper for focusables. */
export function useFocusId(prefix: string): string {
  return `${prefix}:${useId()}`
}
