import { describe, expect, it, vi } from 'vitest'
import { createSystemControl } from '../../../src/main/system/system-control'

const setup = (
  fullscreen = false
): {
  control: ReturnType<typeof createSystemControl>
  run: ReturnType<typeof vi.fn<(file: string, args: readonly string[]) => Promise<void>>>
  quit: ReturnType<typeof vi.fn<() => void>>
  setFullScreen: ReturnType<typeof vi.fn<(value: boolean) => void>>
} => {
  const run = vi.fn<(file: string, args: readonly string[]) => Promise<void>>(async () => {})
  const quit = vi.fn<() => void>()
  let state = fullscreen
  const setFullScreen = vi.fn<(value: boolean) => void>((value) => {
    state = value
  })
  const control = createSystemControl({
    window: () => ({ isFullScreen: () => state, setFullScreen }),
    run,
    quit,
    systemRoot: 'C:\\WINDOWS'
  })
  return { control, run, quit, setFullScreen }
}

describe('system control', () => {
  it('runs one fixed shutdown command, without forcing programs to close', async () => {
    const { control, run } = setup()
    await expect(control.shutdown()).resolves.toEqual({ ok: true, data: null })
    expect(run).toHaveBeenCalledExactlyOnceWith('C:\\WINDOWS\\System32\\shutdown.exe', [
      '/s',
      '/t',
      '0'
    ])
  })

  it('reports a shutdown Windows refused', async () => {
    const { control, run } = setup()
    run.mockRejectedValueOnce(new Error('denied'))
    await expect(control.shutdown()).resolves.toEqual({
      ok: false,
      error: { code: 'shutdown-failed' }
    })
  })

  it('toggles fullscreen from the real state, so F11 is taken into account', () => {
    const { control, setFullScreen } = setup(true)
    expect(control.isFullscreen()).toBe(true)
    expect(control.toggleFullscreen()).toBe(false)
    expect(setFullScreen).toHaveBeenLastCalledWith(false)
    expect(control.toggleFullscreen()).toBe(true)
    expect(setFullScreen).toHaveBeenLastCalledWith(true)
  })

  it('does nothing without a window', () => {
    const control = createSystemControl({
      window: () => null,
      run: async () => {},
      quit: () => {},
      systemRoot: undefined
    })
    expect(control.isFullscreen()).toBe(false)
    expect(() => control.toggleFullscreen()).not.toThrow()
  })

  it('quits only when asked', () => {
    const { control, quit } = setup()
    expect(quit).not.toHaveBeenCalled()
    control.quit()
    expect(quit).toHaveBeenCalledOnce()
  })
})
