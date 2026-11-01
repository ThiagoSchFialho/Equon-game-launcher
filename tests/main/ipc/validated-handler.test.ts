import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createValidatedHandler, IpcRejectedError } from '../../../src/main/ipc/validated-handler'

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
