import { isDirection, type Action, type Direction } from '../input/actions'
import { centerDistance, findNext, type Rect } from './spatial'

export interface FocusableOptions {
  onConfirm?: () => void
  onMenu?: () => void
  onFocus?: () => void
  /** Consumes a direction itself (e.g. up/down change a value); return true when used. */
  onDirection?: (direction: Direction) => boolean
  /** Preferred element when its scope gets focus for the first time. */
  autoFocus?: boolean
  /**
   * How a scroll container brings the element into view: "nearest" (default),
   * "center" (keeps it mid-screen, e.g. the Library grid) or "none" when the
   * container positions it itself (e.g. a transform carousel).
   */
  scroll?: 'nearest' | 'center' | 'none'
}

interface Entry extends FocusableOptions {
  id: string
  scope: string
  el: HTMLElement
}

export type ScreenActions = Partial<
  Record<Exclude<Action, 'confirm' | 'up' | 'down' | 'left' | 'right'>, () => void>
>

interface HandlerEntry {
  key: number
  handlers: ScreenActions
  /** A modal layer (dialog) stops actions from reaching the layers below. */
  modal: boolean
}

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const rectOf = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/**
 * The single focus manager (ARCHITECTURE.md §3.11). Owns which element is
 * focused, moves focus spatially inside the active scope (the top of the
 * scope stack: a screen, or a dialog above it), remembers focus per scope and
 * re-homes focus when the focused element disappears, so focus is never lost.
 */
export class FocusManager {
  private entries = new Map<string, Entry>()
  private scopes: string[] = []
  private remembered = new Map<string, string>()
  private handlers: HandlerEntry[] = []
  private nextHandlerKey = 0
  /** Where the focused element was when it disappeared, to re-home focus in the same scope. */
  private lost: { scope: string; rect: Rect } | null = null
  private listeners = new Set<() => void>()
  private ensureQueued = false
  focusedId: string | null = null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  get activeScope(): string | null {
    return this.scopes.at(-1) ?? null
  }

  register(id: string, scope: string, el: HTMLElement, options: FocusableOptions = {}): void {
    this.entries.set(id, { ...options, id, scope, el })
    this.queueEnsure()
  }

  update(id: string, options: FocusableOptions): void {
    const entry = this.entries.get(id)
    if (entry) this.entries.set(id, { ...entry, ...options })
  }

  unregister(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    if (this.focusedId === id) this.lost = { scope: entry.scope, rect: rectOf(entry.el) }
    this.entries.delete(id)
    this.queueEnsure()
  }

  pushScope(scope: string): void {
    this.scopes = [...this.scopes.filter((s) => s !== scope), scope]
    this.queueEnsure()
  }

  popScope(scope: string): void {
    this.scopes = this.scopes.filter((s) => s !== scope)
    this.queueEnsure()
  }

  pushHandlers(handlers: ScreenActions, modal = false): number {
    const key = this.nextHandlerKey++
    this.handlers.push({ key, handlers, modal })
    return key
  }

  updateHandlers(key: number, handlers: ScreenActions): void {
    const entry = this.handlers.find((h) => h.key === key)
    if (entry) entry.handlers = handlers
  }

  popHandlers(key: number): void {
    this.handlers = this.handlers.filter((h) => h.key !== key)
  }

  focus(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    const changed = this.focusedId !== id
    this.focusedId = id
    this.remembered.set(entry.scope, id)
    if (entry.scroll !== 'none') {
      entry.el.scrollIntoView?.({
        block: entry.scroll === 'center' ? 'center' : 'nearest',
        inline: 'nearest',
        behavior: prefersReducedMotion() ? 'auto' : 'smooth'
      })
    }
    if (changed) {
      entry.onFocus?.()
      this.notify()
    }
  }

  /** Mouse click: focus and confirm. */
  activate(id: string): void {
    this.focus(id)
    this.entries.get(id)?.onConfirm?.()
  }

  /** Mouse right click: focus and open the element's menu. */
  openMenu(id: string): void {
    this.focus(id)
    this.entries.get(id)?.onMenu?.()
  }

  /** Returns true when the action was used. */
  handle(action: Action): boolean {
    this.ensureFocus()
    const current = this.focusedId ? this.entries.get(this.focusedId) : undefined

    if (isDirection(action)) {
      if (!current) return false
      if (current.onDirection?.(action)) return true
      const candidates = this.scopeEntries(current.scope)
        .filter((e) => e.id !== current.id)
        .map((e) => ({ id: e.id, rect: rectOf(e.el) }))
      const next = findNext(rectOf(current.el), candidates, action)
      if (next) this.focus(next)
      return next !== null
    }
    if (action === 'confirm') {
      if (!current?.onConfirm) return false
      current.onConfirm()
      return true
    }
    if (action === 'menu' && current?.onMenu) {
      current.onMenu()
      return true
    }
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      const { handlers, modal } = this.handlers[i]
      const handler = handlers[action]
      if (handler) {
        handler()
        return true
      }
      if (modal) return false
    }
    return false
  }

  private scopeEntries(scope: string): Entry[] {
    return [...this.entries.values()].filter((e) => e.scope === scope)
  }

  private queueEnsure(): void {
    if (this.ensureQueued) return
    this.ensureQueued = true
    queueMicrotask(() => {
      this.ensureQueued = false
      this.ensureFocus()
    })
  }

  /** Keeps focus on a registered element of the active scope. */
  ensureFocus(): void {
    const scope = this.activeScope
    if (scope === null) return
    const current = this.focusedId ? this.entries.get(this.focusedId) : undefined
    if (current && current.scope === scope) return

    const inScope = this.scopeEntries(scope)
    if (inScope.length === 0) {
      if (this.focusedId !== null && !current) {
        this.focusedId = null
        this.notify()
      }
      return
    }
    const remembered = this.remembered.get(scope)
    const target =
      (remembered && this.entries.get(remembered)?.scope === scope ? remembered : null) ??
      (this.lost?.scope === scope ? this.nearest(inScope, this.lost.rect) : null) ??
      inScope.find((e) => e.autoFocus)?.id ??
      this.firstInDocumentOrder(inScope)
    this.lost = null
    this.focus(target)
  }

  private nearest(entries: Entry[], rect: Rect): string {
    let best = entries[0]
    let bestDistance = Infinity
    for (const entry of entries) {
      const distance = centerDistance(rectOf(entry.el), rect)
      if (distance < bestDistance) {
        best = entry
        bestDistance = distance
      }
    }
    return best.id
  }

  private firstInDocumentOrder(entries: Entry[]): string {
    return entries.reduce((first, e) =>
      first.el.compareDocumentPosition(e.el) & Node.DOCUMENT_POSITION_PRECEDING ? e : first
    ).id
  }
}
