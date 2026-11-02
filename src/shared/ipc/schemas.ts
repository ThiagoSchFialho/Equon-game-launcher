import { z } from 'zod'
import { ARTWORK_KINDS, type AppInfo, type GameDetails, type GameSummary } from './contract'

// Argument schemas: main validates every IPC payload against these.
export const appGetInfoArgs = z.tuple([])
export const gamesListArgs = z.tuple([])
export const gamesGetArgs = z.tuple([z.number().int().positive()])

// Response schemas: main validates its own output before replying.
export const appInfoSchema = z.strictObject({
  name: z.string().min(1),
  version: z.string().min(1)
}) satisfies z.ZodType<AppInfo>

export const artworkKindSchema = z.enum(ARTWORK_KINDS)

const gameSummaryShape = {
  id: z.number().int().positive(),
  title: z.string(),
  origin: z.string().min(1),
  originName: z.string().min(1),
  installed: z.boolean().nullable(),
  playtime: z.number().int().nonnegative(),
  timeLastPlayed: z.string().nullable(),
  beated: z.boolean(),
  artwork: z.array(artworkKindSchema)
}

export const gameSummarySchema = z.strictObject(gameSummaryShape) satisfies z.ZodType<GameSummary>

export const gameSummaryListSchema = z.array(gameSummarySchema)

export const gameDetailsSchema = z.strictObject({
  ...gameSummaryShape,
  description: z.string().nullable(),
  developer: z.string().nullable(),
  releaseDate: z.string().nullable(),
  requiredAge: z.string().nullable(),
  genres: z.array(z.string()),
  achievements: z
    .strictObject({
      total: z.number().int().positive(),
      unlocked: z.number().int().nonnegative(),
      platinum: z.boolean()
    })
    .nullable()
}) satisfies z.ZodType<GameDetails>

export const gameDetailsResultSchema = gameDetailsSchema.nullable()
