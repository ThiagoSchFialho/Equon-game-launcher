import type { z } from 'zod'

export interface IpcSender {
  senderFrame: { url: string } | null
}

export class IpcRejectedError extends Error {}

/**
 * Wraps an IPC handler so that it only runs for trusted senders and with
 * arguments that match `argsSchema`. The output is validated too, so a bug in
 * main cannot leak an unexpected shape to the renderer.
 */
export function createValidatedHandler<A extends z.ZodTuple, R extends z.ZodType>(
  argsSchema: A,
  resultSchema: R,
  isTrustedSender: (url: string) => boolean,
  handler: (...args: z.infer<A>) => z.input<R> | Promise<z.input<R>>
): (event: IpcSender, ...args: unknown[]) => Promise<z.infer<R>> {
  return async (event, ...args) => {
    const senderUrl = event.senderFrame?.url
    if (senderUrl === undefined || !isTrustedSender(senderUrl)) {
      throw new IpcRejectedError('Untrusted IPC sender')
    }
    const parsedArgs = argsSchema.safeParse(args)
    if (!parsedArgs.success) {
      throw new IpcRejectedError('Invalid IPC arguments')
    }
    return resultSchema.parse(await handler(...parsedArgs.data))
  }
}
