import { z } from 'zod'
import {
  ARTWORK_EDIT_KINDS,
  ARTWORK_KINDS,
  STEAM_GALLERY_KINDS,
  type AchievementsOverview,
  type AchievementSyncStatus,
  type AppInfo,
  type BrowserListing,
  type ConnectionTest,
  type EmulatorInfo,
  type EditableGame,
  type GameAchievements,
  type GameDetails,
  type GameSummary,
  type BackgroundActivity,
  type LibraryRefreshInfo,
  type ManualGameForm,
  type OriginInfo,
  type SettingsInfo,
  type SteamSyncInfo,
  type SystemInfo
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
  romPath: path.nullable(),
  arguments: z.array(text).max(64),
  workingDirectory: path.nullable(),
  genres: z.array(z.string().min(1).max(100)).max(32).optional()
}) satisfies z.ZodType<ManualGameForm>

export const gamesCreateArgs = z.tuple([manualGameFormSchema])
export const gamesUpdateArgs = z.tuple([id, manualGameFormSchema])
export const gameIdArgs = z.tuple([id])
export const gamesSetFlagsArgs = z.tuple([
  id,
  z
    .strictObject({ hidden: z.boolean().optional(), beated: z.boolean().optional() })
    .refine((flags) => flags.hidden !== undefined || flags.beated !== undefined)
])
export const noArgs = z.tuple([])

/** SteamID64 (17 digits) or null to clear it. */
export const settingsSetSteamIdArgs = z.tuple([
  z
    .string()
    .regex(/^\d{17}$/)
    .nullable()
])
/** API keys: plain tokens; null removes the stored key. */
export const settingsSetSecretArgs = z.tuple([
  z.enum(['steam-api-key', 'steamgriddb-api-key', 'igdb-client-id', 'igdb-client-secret']),
  z
    .string()
    .regex(/^[A-Za-z0-9]{16,128}$/)
    .nullable()
])

/** A checkbox of Settings › Sistema. */
export const settingsSetEnabledArgs = z.tuple([z.boolean()])

export const driveListSchema = z.array(
  z.strictObject({
    letter: z.string().regex(/^[A-Z]:$/),
    label: z.string().nullable(),
    removable: z.boolean(),
    totalBytes: z.number().positive(),
    freeBytes: z.number().nonnegative()
  })
)

export const systemInfoSchema = z.strictObject({
  appVersion: z.string(),
  electron: z.string(),
  chrome: z.string(),
  node: z.string(),
  os: z.string(),
  dataPath: z.string(),
  schemaVersion: z.number().int().nonnegative()
}) satisfies z.ZodType<SystemInfo>

export const igdbSearchArgs = z.tuple([z.string().max(200)])
export const igdbGameArgs = z.tuple([id])
export const igdbApplyArtworkArgs = z.tuple([id, id])

export const igdbSearchResultSchema = z.array(
  z.strictObject({
    id,
    name: z.string(),
    year: z.number().int().nullable(),
    developer: z.string().nullable()
  })
)

export const igdbGameSchema = z
  .strictObject({
    name: z.string(),
    summary: z.string().nullable(),
    releaseDate: z.string().nullable(),
    developer: z.string().nullable(),
    genres: z.array(z.string()),
    requiredAge: z.string().nullable()
  })
  .nullable()

export const backgroundActivitySchema = z
  .strictObject({
    task: z.enum(['achievements', 'library', 'metadata', 'artwork']),
    done: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
  })
  .nullable() satisfies z.ZodType<BackgroundActivity | null>

export const libraryRefreshInfoSchema = z.strictObject({
  status: z.enum(['complete', 'partial', 'failed']),
  reason: z.string().nullable(),
  added: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  ownedError: z.string().nullable(),
  finishedAt: z.string()
}) satisfies z.ZodType<LibraryRefreshInfo>

export const steamSyncInfoSchema = z.strictObject({
  status: z.enum(['ok', 'failed']),
  error: z.string().nullable(),
  games: z.number().int().nonnegative(),
  finishedAt: z.string()
}) satisfies z.ZodType<SteamSyncInfo>

export const connectionTestSchema = z.strictObject({
  personaName: z.string().nullable(),
  gamesVisible: z.boolean()
}) satisfies z.ZodType<ConnectionTest>

const trophyTotalsSchema = z.strictObject({
  platine: z.number().int().nonnegative(),
  gold: z.number().int().nonnegative(),
  silver: z.number().int().nonnegative(),
  bronze: z.number().int().nonnegative()
})

export const achievementsOverviewSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  trophies: trophyTotalsSchema,
  games: z.array(
    z.strictObject({
      id,
      title: z.string(),
      originName: z.string(),
      hidden: z.boolean(),
      timeLastPlayed: z.string().nullable(),
      artwork: z.array(z.enum(ARTWORK_KINDS)),
      artworkVersion: z.string().nullable(),
      unlocked: z.number().int().nonnegative(),
      total: z.number().int().positive(),
      percent: z.number().min(0).max(100),
      platinum: z.boolean()
    })
  ),
  neverSynced: z.boolean()
}) satisfies z.ZodType<AchievementsOverview>

const achievementItemSchema = z.strictObject({
  id,
  name: z.string(),
  description: z.string().nullable(),
  unlockedAt: z.string().nullable(),
  globalPercent: z.number().min(0).max(100).nullable(),
  tier: z.enum(['bronze', 'silver', 'gold']),
  iconCached: z.boolean()
})

export const gameAchievementsResultSchema = z
  .strictObject({
    id,
    title: z.string(),
    status: z.enum(['ready', 'none', 'never-synced']),
    stale: z.boolean(),
    unlockedCount: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    percent: z.number().min(0).max(100).nullable(),
    platinum: z.boolean(),
    trophies: trophyTotalsSchema,
    unlocked: z.array(achievementItemSchema),
    locked: z.array(achievementItemSchema)
  })
  .nullable() satisfies z.ZodType<GameAchievements | null>

export const achievementSyncStatusSchema = z.strictObject({
  running: z.boolean(),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  failures: z.array(z.strictObject({ title: z.string(), reason: z.string() })),
  lastRun: z.string().nullable()
}) satisfies z.ZodType<AchievementSyncStatus>

export const duplicateListSchema = z.array(
  z.strictObject({ manualGameId: id, manualTitle: z.string(), steamTitle: z.string() })
)
export const steamGridDbGameListSchema = z.array(
  z.strictObject({
    id: z.number().int().positive(),
    name: z.string(),
    year: z.number().int().nullable()
  })
)
export const artworkSearchArgs = z.tuple([z.string().max(200)])
const artworkEditKind = z.enum(ARTWORK_EDIT_KINDS)
const externalId = z.number().int().positive()
export const artworkEditBeginArgs = z.tuple([id])
export const artworkEditFromFileArgs = z.tuple([id, artworkEditKind, path])
export const artworkEditFromExternalArgs = z.tuple([id, artworkEditKind, externalId.nullable()])
export const artworkEditFromGridArgs = z.tuple([id, artworkEditKind, externalId])
export const artworkEditFromSteamArgs = z.tuple([id, z.enum(STEAM_GALLERY_KINDS), externalId])
export const steamChoiceListSchema = z.array(z.strictObject({ id: externalId, store: z.boolean() }))
export const artworkEditSaveArgs = z.tuple([
  id,
  z.array(artworkEditKind).max(ARTWORK_EDIT_KINDS.length)
])
export const artworkDraftSchema = z.strictObject({ version: z.number().int().positive() })
export const gridAssetListSchema = z.array(
  z.strictObject({
    id: externalId,
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
)
export const artworkKindListSchema = z.array(z.enum(ARTWORK_KINDS))

export const settingsTestConnectionArgs = z.tuple([z.enum(['steam', 'steamgriddb', 'igdb'])])

export const settingsInfoSchema = z.strictObject({
  steamId: z.string().nullable(),
  steamApiKey: z.boolean(),
  steamGridDbKey: z.boolean(),
  igdbClientId: z.boolean(),
  igdbClientSecret: z.boolean(),
  secretsAvailable: z.boolean(),
  steamPath: z.string().nullable(),
  refreshing: z.boolean(),
  lastRefresh: libraryRefreshInfoSchema.nullable(),
  lastSync: steamSyncInfoSchema.nullable(),
  startFullscreen: z.boolean(),
  openAtLogin: z.boolean(),
  openAtLoginAvailable: z.boolean()
}) satisfies z.ZodType<SettingsInfo>

export const originsCreateArgs = z.tuple([z.string().max(100)])
export const originsRenameArgs = z.tuple([originKey, z.string().max(100)])
export const originsRemoveArgs = z.tuple([originKey])
export const emulatorsSetArgs = z.tuple([originKey, path])
export const emulatorsRemoveArgs = z.tuple([originKey])

export const pickKindSchema = z.enum([
  'executable',
  'game',
  'emulator',
  'rom',
  'image',
  'directory'
])
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
  hidden: z.boolean(),
  artwork: z.array(artworkKindSchema),
  artworkVersion: z.string().nullable(),
  achievementPercent: z.number().min(0).max(100).nullable()
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
  launchable: z.boolean(),
  launchIssue: z
    .enum(['not-installed', 'install-unknown', 'no-config', 'emulator-missing', 'steam-busy'])
    .nullable(),
  tracksTime: z.boolean()
}) satisfies z.ZodType<GameDetails>

export const gameDetailsResultSchema = gameDetailsSchema.nullable()

export const editableGameSchema = z
  .strictObject({
    id,
    form: z.strictObject({
      ...manualGameFormSchema.shape,
      // Stored paths may be invalid by now; the form shows them for correction.
      executablePath: z.string()
    })
  })
  .nullable() satisfies z.ZodType<EditableGame | null>

export const originInfoSchema = z.strictObject({
  key: originKey,
  name: z.string().min(1),
  builtin: z.boolean()
}) satisfies z.ZodType<OriginInfo>

export const originListSchema = z.array(originInfoSchema)

export const emulatorInfoSchema = z.strictObject({
  key: originKey,
  name: z.string().min(1),
  origin: originKey,
  romExtensions: z.array(z.string()),
  executablePath: z.string().nullable()
}) satisfies z.ZodType<EmulatorInfo>

export const emulatorListSchema = z.array(emulatorInfoSchema)

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
