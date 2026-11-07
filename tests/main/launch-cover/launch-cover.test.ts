import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseForegroundLine } from '../../../src/main/launch-cover/foreground'
import {
  createLaunchCover,
  isGameWindow,
  type ForegroundWindow,
  type LaunchCover
} from '../../../src/main/launch-cover/launch-cover'
import type { Result } from '../../../src/shared/ipc/contract'

const OWN_PID = 100
const OK: Result<null> = { ok: true, data: null }
const MONITOR = { width: 1920, height: 1080 }

describe('isGameWindow', () => {
  const launchedAt = 50_000
  const window = (extra: Partial<ForegroundWindow>): ForegroundWindow => ({
    pid: 7,
    process: 'Balatro',
    startedAt: launchedAt + 3000,
    width: 1920,
    height: 1080,
    ...extra
  })
  const check = (extra: Partial<ForegroundWindow>): boolean =>
    isGameWindow(window(extra), launchedAt, OWN_PID, MONITOR)

  it('takes a large window of a program that started after the launch', () => {
    expect(check({})).toBe(true)
  })

  it('takes a game in a window, not only in fullscreen', () => {
    expect(check({ width: 1280, height: 720 })).toBe(true)
    expect(check({ width: 960, height: 540 })).toBe(true)
  })

  // Measured on 2026-11-07, before the game itself.
  it.each([
    ['FortniteClient-Win64-Shipping_EAC_EOS', 800, 450],
    ['forzahorizon6', 311, 151]
  ])('refuses the small window %s opens first', (process, width, height) => {
    expect(check({ process, width, height })).toBe(false)
  })

  it('needs both sides large', () => {
    expect(check({ width: 1920, height: 300 })).toBe(false)
    expect(check({ width: 300, height: 1080 })).toBe(false)
  })

  it('refuses the launchers of other stores, even large', () => {
    for (const process of ['upc', 'EADesktop', 'EpicGamesLauncher', 'Battle.net', 'GalaxyClient']) {
      expect(check({ process }), process).toBe(false)
    }
  })

  it('takes the game of a launcher, which is another process', () => {
    expect(check({ process: 'AC4BFSP' })).toBe(true)
  })

  it('allows for inexact start times', () => {
    expect(check({ startedAt: launchedAt - 500 })).toBe(true)
  })

  it('refuses a program that was already open', () => {
    expect(check({ process: 'Code', startedAt: launchedAt - 60_000 })).toBe(false)
  })

  it('refuses the launcher itself, an empty foreground, the Windows shell and the Steam client', () => {
    expect(check({ pid: OWN_PID, process: 'equon' })).toBe(false)
    expect(check({ pid: 0, process: 'Idle' })).toBe(false)
    for (const process of ['explorer', 'SearchHost', 'steam', 'steamwebhelper', 'STEAM']) {
      expect(check({ process }), process).toBe(false)
    }
  })

  it('takes a program whose start time Windows does not tell, as one run as administrator', () => {
    expect(check({ startedAt: null })).toBe(true)
  })
})

describe('parseForegroundLine', () => {
  it('reads what the watcher prints', () => {
    expect(
      parseForegroundLine(
        '{"pid":7,"process":"Balatro","started":"2026-11-07T19:16:48.4506378Z","width":1936,"height":1119}'
      )
    ).toEqual({
      pid: 7,
      process: 'Balatro',
      startedAt: Date.parse('2026-11-07T19:16:48.450Z'),
      width: 1936,
      height: 1119
    })
  })

  it('reads a process with no name or start time', () => {
    expect(
      parseForegroundLine('{"pid":0,"process":null,"started":null,"width":0,"height":0}')
    ).toEqual({ pid: 0, process: null, startedAt: null, width: 0, height: 0 })
  })

  it('ignores anything else', () => {
    for (const line of ['', 'garbage', '{}', '{"pid":"7"}', '{"pid":7,"width":1}', '[1]']) {
      expect(parseForegroundLine(line), line).toBeNull()
    }
  })
})

describe('launch cover', () => {
  let cover: LaunchCover
  let opacity: number[]
  let order: string[]
  let closed: number
  let active: boolean[]
  let onWindow: (window: ForegroundWindow) => void
  let stopped: number
  let reduced: boolean
  let openFails: boolean

  const game = (extra: Partial<ForegroundWindow> = {}): ForegroundWindow => ({
    pid: 7,
    process: 'Balatro',
    startedAt: Date.now(),
    ...MONITOR,
    ...extra
  })
  const launchOk = vi.fn<() => Promise<Result<null>>>()

  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000 })
    opacity = []
    order = []
    closed = 0
    active = []
    stopped = 0
    reduced = false
    openFails = false
    launchOk.mockReset()
    launchOk.mockImplementation(async () => {
      order.push(`launch at ${opacity.at(-1)}`)
      return OK
    })
    cover = createLaunchCover({
      open: async () => {
        if (openFails) throw new Error('no window')
        return {
          monitor: MONITOR,
          show: () => order.push('show'),
          setOpacity: (value) => opacity.push(value),
          close: () => {
            closed += 1
          }
        }
      },
      watch: (listener) => {
        onWindow = listener
        return {
          stop: () => {
            stopped += 1
          }
        }
      },
      reducedMotion: () => reduced,
      ownPid: OWN_PID,
      now: () => Date.now(),
      onChanged: (value) => active.push(value)
    })
  })
  afterEach(() => vi.useRealTimers())

  const untilCovered = async (): Promise<Promise<Result<null>>> => {
    const run = cover.run(1, launchOk)
    await vi.advanceTimersByTimeAsync(700)
    return run
  }

  it('starts the game only once the screen is fully covered', async () => {
    const run = cover.run(1, launchOk)
    await vi.advanceTimersByTimeAsync(300)
    expect(order).toEqual(['show'])
    expect(opacity.at(-1)).toBeGreaterThan(0)
    expect(opacity.at(-1)).toBeLessThan(1)
    expect(active).toEqual([true])

    await vi.advanceTimersByTimeAsync(400)
    expect(order).toEqual(['show', 'launch at 1'])
    await expect(run).resolves.toEqual(OK)
  })

  it('leaves 3 s after the game window appears, not before', async () => {
    await untilCovered()
    await vi.advanceTimersByTimeAsync(5000)
    onWindow(game())
    await vi.advanceTimersByTimeAsync(2900)
    expect(active).toEqual([true])
    expect(closed).toBe(0)

    await vi.advanceTimersByTimeAsync(100)
    expect(active).toEqual([true, false])
    expect(stopped).toBe(1)
    await vi.advanceTimersByTimeAsync(700)
    expect(opacity.at(-1)).toBe(0)
    expect(closed).toBe(1)
  })

  it('counts the 3 s from the first window of the game', async () => {
    await untilCovered()
    onWindow(game())
    await vi.advanceTimersByTimeAsync(2000)
    onWindow({ ...game(), pid: 8, process: 'other' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(active).toEqual([true, false])
  })

  it('ignores a window that appears before the launch', async () => {
    const run = cover.run(1, launchOk)
    await vi.advanceTimersByTimeAsync(100)
    onWindow(game())
    await vi.advanceTimersByTimeAsync(600)
    await run
    await vi.advanceTimersByTimeAsync(10_000)
    expect(active).toEqual([true])
  })

  it('keeps the screen covered through programs that are not the game', async () => {
    await untilCovered()
    onWindow(game({ pid: 9, process: 'steamwebhelper' }))
    onWindow(game({ pid: 10, process: 'Code', startedAt: 1 }))
    onWindow(game({ pid: 0, process: 'Idle', startedAt: null, width: 0, height: 0 }))
    onWindow(game({ pid: 11, process: 'upc', width: 714, height: 454 }))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(active).toEqual([true])
  })

  it('stays through a splash window and counts the 3 s from the game', async () => {
    await untilCovered()
    onWindow(game({ pid: 12, process: 'FortniteClient_EAC', width: 800, height: 450 }))
    await vi.advanceTimersByTimeAsync(8000)
    expect(active).toEqual([true])

    onWindow(game({ pid: 13, process: 'FortniteClient' }))
    await vi.advanceTimersByTimeAsync(2900)
    expect(active).toEqual([true])
    await vi.advanceTimersByTimeAsync(100)
    expect(active).toEqual([true, false])
  })

  it('takes a splash window that grows into the game', async () => {
    await untilCovered()
    onWindow(game({ width: 311, height: 151 }))
    await vi.advanceTimersByTimeAsync(5000)
    expect(active).toEqual([true])
    onWindow(game())
    await vi.advanceTimersByTimeAsync(3000)
    expect(active).toEqual([true, false])
  })

  it('a game that never shows a large window leaves by the time limit', async () => {
    await untilCovered()
    onWindow(game({ width: 311, height: 151 }))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(active).toEqual([true, false])
  })

  it('always leaves after 60 s', async () => {
    await untilCovered()
    await vi.advanceTimersByTimeAsync(58_000)
    expect(active).toEqual([true])
    await vi.advanceTimersByTimeAsync(2000)
    expect(active).toEqual([true, false])
    await vi.advanceTimersByTimeAsync(700)
    expect(closed).toBe(1)
  })

  it('leaves at once when the launch fails, and passes on the error', async () => {
    const failed: Result<null> = { ok: false, error: { code: 'start-failed' } }
    launchOk.mockResolvedValueOnce(failed)
    await expect(untilCovered()).resolves.toEqual(failed)
    expect(active).toEqual([true, false])
    await vi.advanceTimersByTimeAsync(700)
    expect(closed).toBe(1)
  })

  it('leaves when the launch throws, and passes it on', async () => {
    launchOk.mockRejectedValueOnce(new Error('broken'))
    const run = cover.run(1, launchOk)
    const expectation = expect(run).rejects.toThrow('broken')
    await vi.advanceTimersByTimeAsync(700)
    await expectation
    expect(active).toEqual([true, false])
  })

  it('cancelled while covering: the game is never started', async () => {
    const run = cover.run(1, launchOk)
    await vi.advanceTimersByTimeAsync(200)
    cover.cancel()
    await vi.advanceTimersByTimeAsync(800)
    await expect(run).resolves.toEqual(OK)
    expect(launchOk).not.toHaveBeenCalled()
    expect(closed).toBe(1)
    expect(opacity.at(-1)).toBe(0)
  })

  it('cancelled after the launch: only the image leaves', async () => {
    await untilCovered()
    cover.cancel()
    await vi.advanceTimersByTimeAsync(700)
    expect(launchOk).toHaveBeenCalledOnce()
    expect(closed).toBe(1)
    // Nothing is left to fire later.
    await vi.advanceTimersByTimeAsync(120_000)
    expect(active).toEqual([true, false])
    expect(closed).toBe(1)
  })

  it('goes without fades with reduced motion', async () => {
    reduced = true
    const run = cover.run(1, launchOk)
    await vi.advanceTimersByTimeAsync(0)
    await run
    expect(opacity).toEqual([1])
    expect(order).toEqual(['show', 'launch at 1'])
    cover.cancel()
    await vi.advanceTimersByTimeAsync(0)
    expect(opacity).toEqual([1, 0])
    expect(closed).toBe(1)
  })

  it('never stops the game when the cover cannot open', async () => {
    openFails = true
    await expect(cover.run(1, launchOk)).resolves.toEqual(OK)
    expect(launchOk).toHaveBeenCalledOnce()
    expect(active).toEqual([])
  })

  it('a second launch under the cover has no second cover', async () => {
    await untilCovered()
    const other = vi.fn(async () => OK)
    await cover.run(2, other)
    expect(other).toHaveBeenCalledOnce()
    expect(order.filter((step) => step === 'show')).toHaveLength(1)
  })

  it('can run again after leaving', async () => {
    await untilCovered()
    cover.cancel()
    await vi.advanceTimersByTimeAsync(700)
    await untilCovered()
    expect(order.filter((step) => step === 'show')).toHaveLength(2)
  })

  it('closes at once when the app closes', async () => {
    await untilCovered()
    cover.dispose()
    expect(closed).toBe(1)
    expect(stopped).toBe(1)
    expect(active).toEqual([true, false])
  })
})
