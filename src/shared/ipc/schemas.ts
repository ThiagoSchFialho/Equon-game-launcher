import { z } from 'zod'
import {
  ARTWORK_KINDS,
  type AppInfo,
  type BrowserListing,
  type EditableGame,
  type GameDetails,
  type GameSummary,
  type ManualGameForm,
  type OriginInfo
} from './contract'

const id = z.number().int().positive()
const text = z.string().max(4000)
const path = z.string().min(1).max(1024)
const originKey = z.string().min(1).max(64)

// Argument schemas: main validates every IPC payload against these.
export const appGetInfoArgs = z.tuple([])
export const gamesListArgs = z.tuple([])
export const gamesGetArgs = z.tuple([id])

export const manualGameFormSchema = z.strictObject({
  title: z.string().max(200),
  description: text.nullable(),
  developer: text.nullable(),
  releaseDate: z.string().max(10).nullable(),
  requiredAge: z.string().max(2).nullable(),
  playtimeOffset: z.number().int().nonnegative().max(10_000_000),
  origin: originKey,
  executablePath: z.string().max(1024),
  arguments: z.array(text).max(64),
  workingDirectory: path.nullable(),
  backgroundPath: path.nullable()
}) satisfies z.ZodType<ManualGameForm>

export const gamesCreateArgs = z.tuple([manualGameFormSchema])
export const gamesUpdateArgs = z.tuple([id, manualGameFormSchema])
export const gameIdArgs = z.tuple([id])
export const noArgs = z.tuple([])

export const originsCreateArgs = z.tuple([z.string().max(100)])
export const originsRenameArgs = z.tuple([originKey, z.string().max(100)])
export const originsRemoveArgs = z.tuple([originKey])
export const originsSetDefaultsArgs = z.tuple([
  originKey,
  path.nullable(),
  z.array(text).max(64).nullable()
])

export const pickKindSchema = z.enum(['executable', 'rom', 'image', 'directory'])
export const filesListArgs = z.tuple([path.nullable(), pickKindSchema])
export const filesPickNativeArgs = z.tuple([pickKindSchema])

// Response schemas: main validates its own output before replying.
export const appInfoSchema = z.strictObject({
  name: z.string().min(1),
  version: z.string().min(1)
}) satisfies z.ZodType<AppInfo>

export const artworkKindSchema = z.enum(ARTWORK_KINDS)

const gameSummaryShape = {
  id,
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
    .nullable(),
  editable: z.boolean(),
  launchable: z.boolean()
}) satisfies z.ZodType<GameDetails>

export const gameDetailsResultSchema = gameDetailsSchema.nullable()

export const editableGameSchema = z
  .strictObject({
    id,
    form: z.strictObject({
      ...manualGameFormSchema.shape,
      // Stored paths may be invalid by now; the form shows them for correction.
      executablePath: z.string()
    }),
    hasBackground: z.boolean()
  })
  .nullable() satisfies z.ZodType<EditableGame | null>

export const originInfoSchema = z.strictObject({
  key: originKey,
  name: z.string().min(1),
  builtin: z.boolean(),
  defaultExecutablePath: z.string().nullable(),
  defaultArguments: z.array(z.string()).nullable()
}) satisfies z.ZodType<OriginInfo>

export const originListSchema = z.array(originInfoSchema)

export const runningIdsSchema = z.array(id)

export const browserListingSchema = z.strictObject({
  path: z.string().nullable(),
  parent: z.string().nullable(),
  entries: z.array(
    z.strictObject({ name: z.string(), path: z.string(), type: z.enum(['directory', 'file']) })
  ),
  truncated: z.boolean()
}) satisfies z.ZodType<BrowserListing>

const appErrorSchema = z.strictObject({ code: z.string().min(1), field: z.string().optional() })

/** Result<T> envelope for handlers whose failures are expected. */
export function resultSchema<T extends z.ZodType>(
  data: T
): z.ZodUnion<
  [
    z.ZodObject<{ ok: z.ZodLiteral<true>; data: T }, z.core.$strict>,
    z.ZodObject<{ ok: z.ZodLiteral<false>; error: typeof appErrorSchema }, z.core.$strict>
  ]
> {
  return z.union([
    z.strictObject({ ok: z.literal(true), data }),
    z.strictObject({ ok: z.literal(false), error: appErrorSchema })
  ])
}

export const nativePickResultSchema = path.nullable()
