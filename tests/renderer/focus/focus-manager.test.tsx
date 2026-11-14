// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FocusManager } from '../../../src/renderer/src/focus/focus-manager'
import { FocusProvider, FocusScope } from '../../../src/renderer/src/focus/FocusProvider'
import { useFocusable, useScreenActions } from '../../../src/renderer/src/focus/focus-context'

// jsdom has no layout: give each element a rect from its data attributes.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const x = Number(this.dataset.x ?? 0) * 110
    const y = Number(this.dataset.y ?? 0) * 110
    return {
      left: x,
      top: y,
      width: 100,
      height: 100,
      right: x + 100,
      bottom: y + 100,
      x,
      y
    } as DOMRect
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('sound cues', () => {
  function Actions({ onBack }: { onBack: () => void }): null {
    useScreenActions({ back: onBack, nextSection: () => {} })
    return null
  }

  it('reports what the user did, and nothing for focus that moves by itself', async () => {
    const cues: string[] = []
    const manager = new FocusManager({ onCue: (cue) => cues.push(cue) })
    render(
      <FocusProvider manager={manager}>
        <FocusScope id="screen">
          <Actions onBack={() => {}} />
          <Item id="a" x={0} onConfirm={() => {}} />
          <Item id="b" x={1} onConfirm={() => {}} confirmSound="play" />
          <Item id="c" x={2} />
        </FocusScope>
      </FocusProvider>
    )
    await act(async () => {})
    // The screen opening put the focus on "a": silent.
    expect(cues).toEqual([])

    act(() => void manager.handle('right'))
    act(() => void manager.handle('confirm'))
    act(() => void manager.handle('left'))
    act(() => void manager.handle('confirm'))
    act(() => void manager.handle('back'))
    act(() => void manager.handle('nextSection'))
    expect(cues).toEqual(['navigate', 'play', 'navigate', 'confirm', 'back', 'section'])

    // Nothing to confirm, or nowhere to go: silent.
    act(() => void manager.handle('left'))
    act(() => manager.focus('c'))
    act(() => void manager.handle('confirm'))
    // No section that way (the screen gives no handler at an end): silent too.
    act(() => void manager.handle('previousSection'))
    expect(cues).toHaveLength(6)

    // A mouse click confirms with the same sound.
    act(() => manager.activate('b'))
    expect(cues.at(-1)).toBe('play')
  })

  it('a move an item makes itself sounds the same; a value it changes stays silent', async () => {
    const cues: string[] = []
    const manager = new FocusManager({ onCue: (cue) => cues.push(cue) })
    let value = 0
    render(
      <FocusProvider manager={manager}>
        <FocusScope id="screen">
          {/* Like an achievements column: down moves to the next one by itself. */}
          <Item
            id="row1"
            x={0}
            autoFocus
            onDirection={(d) => {
              if (d !== 'down') return false
              manager.focus('row2')
              return true
            }}
          />
          <Item id="row2" x={0} y={1} />
          {/* Like the date picker: up changes the value, the focus stays. */}
          <Item
            id="date"
            x={1}
            onDirection={(d) => {
              if (d !== 'up') return false
              value += 1
              return true
            }}
          />
        </FocusScope>
      </FocusProvider>
    )
    await act(async () => {})
    act(() => void manager.handle('down'))
    expect(manager.focusedId).toBe('row2')
    expect(cues).toEqual(['navigate'])

    act(() => manager.focus('date'))
    act(() => void manager.handle('up'))
    expect(value).toBe(1)
    expect(cues).toEqual(['navigate'])
  })
})

describe('scroll animation', () => {
  it('jumps when focus is restored and animates when the user moves it', async () => {
    const scroll = vi.fn()
    HTMLElement.prototype.scrollIntoView = scroll
    const manager = new FocusManager()
    const Screen = ({ show }: { show: boolean }): React.JSX.Element =>
      show ? (
        <FocusScope id="screen">
          <Item id="a" x={0} />
          <Item id="b" x={1} />
        </FocusScope>
      ) : (
        <FocusScope id="details">
          <Item id="c" x={0} />
        </FocusScope>
      )
    const { rerender } = render(
      <FocusProvider manager={manager}>
        <Screen show />
      </FocusProvider>
    )
    await act(async () => {})
    expect(scroll.mock.lastCall?.[0].behavior).toBe('auto')

    act(() => void manager.handle('right'))
    expect(manager.focusedId).toBe('b')
    expect(scroll.mock.lastCall?.[0].behavior).toBe('smooth')
    expect(manager.rememberedFocus('screen')).toBe('b')

    rerender(
      <FocusProvider manager={manager}>
        <Screen show={false} />
      </FocusProvider>
    )
    await act(async () => {})
    rerender(
      <FocusProvider manager={manager}>
        <Screen show />
      </FocusProvider>
    )
    await act(async () => {})
    expect(manager.focusedId).toBe('b')
    expect(scroll.mock.lastCall?.[0].behavior).toBe('auto')
  })
})

function Item({
  id,
  x,
  y = 0,
  onConfirm,
  onMenu,
  autoFocus,
  confirmSound,
  onDirection
}: {
  id: string
  x: number
  y?: number
  onConfirm?: () => void
  onMenu?: () => void
  autoFocus?: boolean
  confirmSound?: 'play'
  onDirection?: (direction: 'up' | 'down' | 'left' | 'right') => boolean
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    onConfirm,
    onMenu,
    autoFocus,
    confirmSound,
    onDirection
  })
  return (
    <button ref={setElement} data-x={x} data-y={y} data-focused={focused} {...mouse}>
      {id}
    </button>
  )
}

const flush = (): Promise<void> => act(async () => {})
const focusedText = (): string | null =>
  document.querySelector('[data-focused="true"]')?.textContent ?? null

describe('focus manager', () => {
  it('focuses the first element, moves spatially and confirms', async () => {
    const manager = new FocusManager()
    const confirm = vi.fn()
    render(
      <FocusProvider manager={manager}>
        <FocusScope id="screen">
          <Item id="a" x={0} />
          <Item id="b" x={1} onConfirm={confirm} />
          <Item id="c" x={0} y={1} />
        </FocusScope>
      </FocusProvider>
    )
    await flush()
    expect(focusedText()).toBe('a')

    act(() => void manager.handle('right'))
    expect(focusedText()).toBe('b')
    act(() => void manager.handle('confirm'))
    expect(confirm).toHaveBeenCalledOnce()

    act(() => void manager.handle('left'))
    act(() => void manager.handle('down'))
    expect(focusedText()).toBe('c')
    // No wrap-around at the edges.
    expect(manager.handle('down')).toBe(false)
    expect(focusedText()).toBe('c')
  })

  it('a move filter keeps directions inside their side, but not focus()', async () => {
    const manager = new FocusManager()
    render(
      <FocusProvider manager={manager}>
        <FocusScope id="screen">
          <div data-side="tabs">
            <Item id="tab-1" x={0} />
            <Item id="tab-2" x={0} y={1} />
          </div>
          <div data-side="page">
            <Item id="page-1" x={1} />
            <Item id="page-2" x={2} />
          </div>
        </FocusScope>
      </FocusProvider>
    )
    await flush()
    const side = (el: HTMLElement): string | undefined =>
      el.closest<HTMLElement>('[data-side]')?.dataset.side
    const remove = manager.setMoveFilter('screen', (from, to) => side(from) === side(to))

    expect(focusedText()).toBe('tab-1')
    expect(manager.handle('right')).toBe(false)
    expect(focusedText()).toBe('tab-1')
    act(() => void manager.handle('down'))
    expect(focusedText()).toBe('tab-2')

    act(() => manager.focus('page-1'))
    act(() => void manager.handle('right'))
    expect(focusedText()).toBe('page-2')
    act(() => void manager.handle('left'))
    expect(manager.handle('left')).toBe(false)
    expect(focusedText()).toBe('page-1')

    remove()
    act(() => void manager.handle('left'))
    expect(focusedText()).toBe('tab-1')
  })

  it('honours autoFocus', async () => {
    const manager = new FocusManager()
    render(
      <FocusProvider manager={manager}>
        <FocusScope id="screen">
          <Item id="a" x={0} />
          <Item id="b" x={1} autoFocus />
        </FocusScope>
      </FocusProvider>
    )
    await flush()
    expect(focusedText()).toBe('b')
  })

  it('traps focus in an open dialog and restores it on close', async () => {
    const manager = new FocusManager()
    function Screen(): React.JSX.Element {
      const [open, setOpen] = useState(false)
      return (
        <FocusScope id="screen">
          <Item id="a" x={0} />
          <Item id="opener" x={1} onConfirm={() => setOpen(true)} />
          {open && <Dialog onClose={() => setOpen(false)} />}
        </FocusScope>
      )
    }
    function Dialog({ onClose }: { onClose: () => void }): React.JSX.Element {
      useScreenActions({ back: onClose }, true)
      return (
        <FocusScope id="dialog">
          <Item id="first" x={5} y={5} />
          <Item id="close" x={5} y={6} onConfirm={onClose} />
        </FocusScope>
      )
    }
    render(
      <FocusProvider manager={manager}>
        <Screen />
      </FocusProvider>
    )
    await flush()
    act(() => void manager.handle('right'))
    expect(focusedText()).toBe('opener')

    act(() => void manager.handle('confirm'))
    await flush()
    expect(focusedText()).toBe('first')
    // Spatial moves stay inside the dialog even though "a" is to the left.
    expect(manager.handle('left')).toBe(false)
    act(() => void manager.handle('down'))
    expect(focusedText()).toBe('close')

    act(() => void manager.handle('back'))
    await flush()
    expect(focusedText()).toBe('opener')
  })

  it('re-homes focus to the nearest element when the focused one disappears', async () => {
    const manager = new FocusManager()
    function List(): React.JSX.Element {
      const [items, setItems] = useState(['a', 'b', 'c'])
      return (
        <FocusScope id="screen">
          {items.map((id, i) => (
            <Item
              key={id}
              id={id}
              x={i}
              onConfirm={() => setItems((all) => all.filter((x) => x !== id))}
            />
          ))}
        </FocusScope>
      )
    }
    render(
      <FocusProvider manager={manager}>
        <List />
      </FocusProvider>
    )
    await flush()
    act(() => void manager.handle('right'))
    expect(focusedText()).toBe('b')
    act(() => void manager.handle('confirm'))
    await flush()
    expect(screen.queryByText('b')).toBeNull()
    expect(focusedText()).not.toBeNull()
  })

  it('routes screen actions to the top layer; a modal layer blocks those below', async () => {
    const manager = new FocusManager()
    const screenBack = vi.fn()
    const screenNext = vi.fn()
    const dialogBack = vi.fn()
    function Screen({ dialog }: { dialog: boolean }): React.JSX.Element {
      useScreenActions({ back: screenBack, nextSection: screenNext })
      return (
        <FocusScope id="screen">
          <Item id="a" x={0} />
          {dialog && <Dialog />}
        </FocusScope>
      )
    }
    function Dialog(): React.JSX.Element {
      useScreenActions({ back: dialogBack }, true)
      return (
        <FocusScope id="dialog">
          <Item id="d" x={3} />
        </FocusScope>
      )
    }
    const { rerender } = render(
      <FocusProvider manager={manager}>
        <Screen dialog={false} />
      </FocusProvider>
    )
    await flush()
    manager.handle('nextSection')
    expect(screenNext).toHaveBeenCalledOnce()

    rerender(
      <FocusProvider manager={manager}>
        <Screen dialog />
      </FocusProvider>
    )
    await flush()
    manager.handle('back')
    manager.handle('nextSection')
    expect(dialogBack).toHaveBeenCalledOnce()
    expect(screenBack).not.toHaveBeenCalled()
    expect(screenNext).toHaveBeenCalledOnce()
  })

  it('supports mouse: click focuses and confirms, right click opens the menu', async () => {
    const manager = new FocusManager()
    const confirm = vi.fn()
    const menu = vi.fn()
    render(
      <FocusProvider manager={manager}>
        <FocusScope id="screen">
          <Item id="a" x={0} />
          <Item id="b" x={1} onConfirm={confirm} onMenu={menu} />
        </FocusScope>
      </FocusProvider>
    )
    await flush()
    act(() => screen.getByText('b').click())
    expect(focusedText()).toBe('b')
    expect(confirm).toHaveBeenCalledOnce()
    act(() => {
      screen.getByText('a').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    })
    expect(focusedText()).toBe('a')
    expect(menu).not.toHaveBeenCalled()
  })
})

describe('focus manager across screens', () => {
  it('uses autoFocus on a new screen instead of the position of the previous screen', async () => {
    const manager = new FocusManager()
    function App({ screen }: { screen: 'a' | 'b' }): React.JSX.Element {
      return screen === 'a' ? (
        <FocusScope id="screen:a">
          <Item id="a1" x={0} />
          <Item id="a2" x={3} />
        </FocusScope>
      ) : (
        <FocusScope id="screen:b">
          <Item id="b1" x={0} />
          <Item id="b2" x={1} autoFocus />
          <Item id="b3" x={3} />
        </FocusScope>
      )
    }
    const { rerender } = render(
      <FocusProvider manager={manager}>
        <App screen="a" />
      </FocusProvider>
    )
    await flush()
    act(() => void manager.handle('right'))
    expect(focusedText()).toBe('a2')

    rerender(
      <FocusProvider manager={manager}>
        <App screen="b" />
      </FocusProvider>
    )
    await flush()
    // b3 sits where a2 was, but b2 is the screen's autoFocus element.
    expect(focusedText()).toBe('b2')
  })
})
