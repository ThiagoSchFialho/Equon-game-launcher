import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createValidatedHandler, IpcRejectedError } from '../../../src/main/ipc/validated-handler'
import {
  gamesSetFlagsArgs,
  gamesUpdateSteamArgs,
  settingsSetHomeArtArgs,
  settingsSetHomeCoversArgs
} from '../../../src/shared/ipc/schemas'

const trusted = { senderFrame: { url: 'app://trusted' } }
const isTrustedSender = (url: string): boolean => url === 'app://trusted'

describe('createValidatedHandler', () => {
  const resultSchema = z.strictObject({ total: z.number() })

  it('runs the handler with parsed arguments for a trusted sender', async () => {
    const handler = createValidatedHandler(
      z.tuple([z.number().int(), z.number().int()]),
      resultSchema,
      isTrustedSender,
      (a, b) => ({ total: a + b })
    )
    await expect(handler(trusted, 2, 3)).resolves.toEqual({ total: 5 })
  })

  it('rejects untrusted or missing sender frames without running the handler', async () => {
    const fn = vi.fn(() => ({ total: 0 }))
    const handler = createValidatedHandler(z.tuple([]), resultSchema, isTrustedSender, fn)
    await expect(handler({ senderFrame: { url: 'https://evil.example' } })).rejects.toThrow(
      IpcRejectedError
    )
    await expect(handler({ senderFrame: null })).rejects.toThrow(IpcRejectedError)
    expect(fn).not.toHaveBeenCalled()
  })

  it('rejects wrong, missing or extra arguments', async () => {
    const fn = vi.fn(() => ({ total: 0 }))
    const handler = createValidatedHandler(z.tuple([z.number()]), resultSchema, isTrustedSender, fn)
    await expect(handler(trusted, '1')).rejects.toThrow(IpcRejectedError)
    await expect(handler(trusted)).rejects.toThrow(IpcRejectedError)
    await expect(handler(trusted, 1, 2)).rejects.toThrow(IpcRejectedError)
    expect(fn).not.toHaveBeenCalled()
  })

  it('refuses to return a result that does not match the schema', async () => {
    const handler = createValidatedHandler(z.tuple([]), resultSchema, isTrustedSender, () => ({
      total: 1,
      secret: 'leak'
    }))
    await expect(handler(trusted)).rejects.toThrow()
  })
})

describe('games:update-steam arguments', () => {
  const details = { description: null, developer: 'Valve', releaseDate: null, requiredAge: null }

  it('takes the details only: never a name, launch, playtime or origin', () => {
    expect(gamesUpdateSteamArgs.safeParse([1, details]).success).toBe(true)
    expect(gamesUpdateSteamArgs.safeParse([1, { ...details, genres: ['Puzzle'] }]).success).toBe(
      true
    )
    for (const extra of [
      { title: 'Renamed' },
      { executablePath: 'C:\\evil.exe' },
      { playtimeOffset: 9 },
      { origin: 'manual' }
    ]) {
      expect(gamesUpdateSteamArgs.safeParse([1, { ...details, ...extra }]).success).toBe(false)
    }
  })
})

describe('settings:set-home-art arguments', () => {
  it('takes what changed, within range and step, and nothing else', () => {
    const ok = (changes: unknown): boolean => settingsSetHomeArtArgs.safeParse([changes]).success
    expect(ok({ enabled: true })).toBe(true)
    expect(ok({ blur: 0 })).toBe(true)
    expect(ok({ blur: 10, dim: 90 })).toBe(true)
    expect(ok({})).toBe(false)
    expect(ok({ blur: 11 })).toBe(false)
    expect(ok({ blur: 2.5 })).toBe(false)
    expect(ok({ dim: 35 })).toBe(false)
    expect(ok({ dim: 100 })).toBe(false)
    expect(ok({ enabled: 1 })).toBe(false)
    expect(ok({ blur: 4, url: 'x' })).toBe(false)
  })
})

describe('settings:set-home-covers arguments', () => {
  it('takes what changed, within 1 to 100 and the three positions, and nothing else', () => {
    const ok = (changes: unknown): boolean => settingsSetHomeCoversArgs.safeParse([changes]).success
    expect(ok({ size: 1 })).toBe(true)
    expect(ok({ size: 100, gap: 100, position: 'bottom' })).toBe(true)
    expect(ok({ position: 'center' })).toBe(true)
    expect(ok({ position: 'top' })).toBe(true)
    expect(ok({})).toBe(false)
    expect(ok({ size: 0 })).toBe(false)
    expect(ok({ gap: 101 })).toBe(false)
    expect(ok({ size: 50.5 })).toBe(false)
    expect(ok({ position: 'left' })).toBe(false)
    expect(ok({ size: 50, css: 'x' })).toBe(false)
  })
})

describe('games:set-flags arguments', () => {
  it('accepts one or both known flags and nothing else', () => {
    expect(gamesSetFlagsArgs.safeParse([1, { hidden: true }]).success).toBe(true)
    expect(gamesSetFlagsArgs.safeParse([1, { hidden: false, beated: true }]).success).toBe(true)
    expect(gamesSetFlagsArgs.safeParse([1, {}]).success).toBe(false)
    expect(gamesSetFlagsArgs.safeParse([1, { hidden: 1 }]).success).toBe(false)
    expect(gamesSetFlagsArgs.safeParse([1, { hidden: true, playtime: 9 }]).success).toBe(false)
    expect(gamesSetFlagsArgs.safeParse([-1, { hidden: true }]).success).toBe(false)
  })
})
