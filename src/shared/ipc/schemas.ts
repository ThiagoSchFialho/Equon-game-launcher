import { z } from 'zod'
import type { AppInfo } from './contract'

// Argument schemas: main validates every IPC payload against these.
export const appGetInfoArgs = z.tuple([])

// Response schemas: main validates its own output before replying.
export const appInfoSchema = z.strictObject({
  name: z.string().min(1),
  version: z.string().min(1)
}) satisfies z.ZodType<AppInfo>
