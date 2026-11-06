import { z } from 'zod'
import type { IgdbGameFill } from '../../shared/ipc/contract'
import type { IgdbClient, IgdbResult } from './igdb'

const IMAGE_ID = /^[a-z0-9]+$/

/** What is a game of its own: not an add-on, a mod, a season or a bundle. */
const GAME_TYPES = new Set([
  'main_game',
  'standalone_expansion',
  'remake',
  'remaster',
  'expanded_game',
  'port',
  'episode'
])

const CLASS_IND: Record<string, string> = {
  L: 'L',
  TEN: '10',
  TWELVE: '12',
  FOURTEEN: '14',
  SIXTEEN: '16',
  EIGHTEEN: '18',
  '10': '10',
  '12': '12',
  '14': '14',
  '16': '16',
  '18': '18'
}

export interface IgdbSearchResult {
  id: number
  name: string
  year: number | null
  /** Tells apart games with the same name. */
  developer: string | null
}

export interface IgdbImage {
  imageId: string
  width: number | null
  height: number | null
}

export interface IgdbGameData {
  name: string
  /** In English: IGDB has no localized descriptions. */
  summary: string | null
  /** YYYY-MM-DD */
  releaseDate: string | null
  developer: string | null
  /** Names as IGDB gives them, in English. */
  genres: string[]
  /** 'L', '10', '12', '14', '16', '18' or null when ClassInd has not rated it here. */
  requiredAge: string | null
  cover: IgdbImage | null
  artworks: IgdbImage[]
  screenshots: IgdbImage[]
  logos: IgdbImage[]
}

const imageSchema = z.object({
  image_id: z.string().regex(IMAGE_ID),
  width: z.number().optional(),
  height: z.number().optional()
})
/** One broken entry does not cost the rest of the answer. */
const tolerant = <T extends z.ZodType>(item: T): z.ZodType<z.infer<T>[]> =>
  z.array(z.unknown()).transform((list) =>
    list.flatMap((entry) => {
      const parsed = item.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    })
  ) as unknown as z.ZodType<z.infer<T>[]>

const searchSchema = tolerant(
  z.object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    first_release_date: z.number().optional(),
    version_parent: z.number().optional(),
    game_type: z.object({ type: z.string() }).optional(),
    total_rating_count: z.number().optional(),
    involved_companies: tolerant(
      z.object({
        developer: z.boolean().optional(),
        company: z.object({ name: z.string().min(1) })
      })
    ).optional()
  })
)

const gameSchema = z.array(
  z.object({
    name: z.string().min(1),
    summary: z.string().optional(),
    first_release_date: z.number().optional(),
    genres: tolerant(z.object({ name: z.string().min(1) })).optional(),
    involved_companies: tolerant(
      z.object({
        developer: z.boolean().optional(),
        company: z.object({ name: z.string().min(1) })
      })
    ).optional(),
    age_ratings: tolerant(
      z.object({
        organization: z.object({ name: z.string() }).optional(),
        rating_category: z.object({ rating: z.string() }).optional()
      })
    ).optional(),
    cover: imageSchema.optional(),
    artworks: tolerant(imageSchema).optional(),
    screenshots: tolerant(imageSchema).optional()
  })
)

const logosSchema = tolerant(imageSchema)

const toImage = (raw: z.infer<typeof imageSchema>): IgdbImage => ({
  imageId: raw.image_id,
  width: raw.width ?? null,
  height: raw.height ?? null
})

const utcDate = (seconds: number | undefined): Date | null =>
  seconds === undefined || !Number.isFinite(seconds) ? null : new Date(seconds * 1000)

/** The table of game types has display names ("Main Game"): compared by a stable key. */
const typeKey = (type: string): string =>
  type
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')

const sameName = (a: string, b: string): boolean =>
  a.trim().localeCompare(b.trim(), undefined, { sensitivity: 'base' }) === 0

/** Apicalypse has no parameters: a typed name must not be able to end the string. */
// eslint-disable-next-line no-control-regex
const UNSAFE_IN_QUERY = /["\\\u0000-\u001f]/g

function quoted(text: string): string {
  return `"${text.replace(UNSAFE_IN_QUERY, ' ').trim().slice(0, 200)}"`
}

/** Games by name, without editions, add-ons and the like. */
export async function searchIgdbGames(
  client: IgdbClient,
  term: string
): Promise<IgdbResult<IgdbSearchResult[]>> {
  if (term.trim() === '') return { ok: true, data: [] }
  const result = await client.query(
    'games',
    `search ${quoted(term)}; fields name,first_release_date,version_parent,game_type.type,total_rating_count,involved_companies.developer,involved_companies.company.name; limit 50;`
  )
  if (!result.ok) return result
  const parsed = searchSchema.safeParse(result.data)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  return {
    ok: true,
    data: parsed.data
      .filter(
        (game) =>
          game.version_parent === undefined &&
          (game.game_type === undefined || GAME_TYPES.has(typeKey(game.game_type.type)))
      )
      // IGDB's own order puts obscure entries first: the exact name, then the best known.
      .map((game, position) => ({ game, position }))
      .sort(
        (a, b) =>
          Number(sameName(b.game.name, term)) - Number(sameName(a.game.name, term)) ||
          (b.game.total_rating_count ?? 0) - (a.game.total_rating_count ?? 0) ||
          a.position - b.position
      )
      .slice(0, 12)
      .map(({ game }) => ({
        id: game.id,
        name: game.name.trim(),
        year: utcDate(game.first_release_date)?.getUTCFullYear() ?? null,
        developer: game.involved_companies?.find((c) => c.developer)?.company.name.trim() ?? null
      }))
  }
}

function classInd(
  ratings: { organization?: { name: string }; rating_category?: { rating: string } }[] | undefined
): string | null {
  for (const rating of ratings ?? []) {
    const organization = rating.organization?.name.replace(/[^a-z]/gi, '').toUpperCase()
    if (organization !== 'CLASSIND') continue
    const value = rating.rating_category?.rating.toUpperCase().replace(/^CLASS_?IND_?/, '')
    if (value && CLASS_IND[value]) return CLASS_IND[value]
  }
  return null
}

/** Everything used from one game, in two requests: logos have their own endpoint. */
export async function fetchIgdbGame(
  client: IgdbClient,
  id: number
): Promise<IgdbResult<IgdbGameData | null>> {
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: true, data: null }
  // Every field of a relation needs its prefix: "cover.a,b" would read b from the game.
  const image = (of: string): string =>
    ['image_id', 'width', 'height'].map((field) => `${of}.${field}`).join(',')
  const result = await client.query(
    'games',
    `fields name,summary,first_release_date,genres.name,involved_companies.developer,involved_companies.company.name,age_ratings.organization.name,age_ratings.rating_category.rating,${image('cover')},${image('artworks')},${image('screenshots')}; where id = ${id}; limit 1;`
  )
  if (!result.ok) return result
  const parsed = gameSchema.safeParse(result.data)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  const game = parsed.data[0]
  if (!game) return { ok: true, data: null }

  const logos = await client.query(
    'logos',
    `fields image_id,width,height; where game = ${id}; limit 10;`
  )
  if (!logos.ok) return logos
  const parsedLogos = logosSchema.safeParse(logos.data)
  if (!parsedLogos.success) return { ok: false, error: 'invalid-response' }

  const released = utcDate(game.first_release_date)
  return {
    ok: true,
    data: {
      name: game.name.trim(),
      summary: game.summary?.trim() || null,
      releaseDate: released ? released.toISOString().slice(0, 10) : null,
      developer: game.involved_companies?.find((c) => c.developer)?.company.name.trim() ?? null,
      genres: (game.genres ?? []).map((g) => g.name.trim()),
      requiredAge: classInd(game.age_ratings),
      cover: game.cover ? toImage(game.cover) : null,
      artworks: (game.artworks ?? []).map(toImage),
      screenshots: (game.screenshots ?? []).map(toImage),
      logos: parsedLogos.data.map(toImage)
    }
  }
}

/** IGDB's genres, as they appear next to the Portuguese ones from Steam. Unknown ones stay as they are. */
const GENRES_PT: Record<string, string> = {
  'Point-and-click': 'Apontar e clicar',
  Fighting: 'Luta',
  Shooter: 'Tiro',
  Music: 'Música',
  Platform: 'Plataforma',
  Puzzle: 'Quebra-cabeça',
  Racing: 'Corrida',
  'Real Time Strategy (RTS)': 'Estratégia em tempo real',
  'Role-playing (RPG)': 'RPG',
  Simulator: 'Simulação',
  Sport: 'Esportes',
  Strategy: 'Estratégia',
  'Turn-based strategy (TBS)': 'Estratégia por turnos',
  Tactical: 'Tática',
  "Hack and slash/Beat 'em up": 'Hack and slash',
  'Quiz/Trivia': 'Perguntas e respostas',
  Pinball: 'Pinball',
  Adventure: 'Aventura',
  Indie: 'Indie',
  Arcade: 'Arcade',
  'Visual Novel': 'Visual novel',
  'Card & Board Game': 'Cartas e tabuleiro',
  MOBA: 'MOBA'
}

/** The Steam entry of `external_game_sources` (measured on 2026-11-05). */
const STEAM_SOURCE = 1

const steamLinkSchema = tolerant(z.object({ game: z.number().int().positive() }))

/** A Steam game by its App ID, not by name, so it cannot bring another game's art. */
export async function fetchIgdbSteamGame(
  client: IgdbClient,
  appId: number
): Promise<IgdbResult<IgdbGameData | null>> {
  if (!Number.isSafeInteger(appId) || appId <= 0) return { ok: true, data: null }
  const result = await client.query(
    'external_games',
    `fields game; where external_game_source = ${STEAM_SOURCE} & uid = "${appId}"; limit 1;`
  )
  if (!result.ok) return result
  const parsed = steamLinkSchema.safeParse(result.data)
  if (!parsed.success) return { ok: false, error: 'invalid-response' }
  const link = parsed.data[0]
  return link ? fetchIgdbGame(client, link.game) : { ok: true, data: null }
}

/** What the form shows: the text fields, with the genres translated. Images stay in main. */
export async function fetchIgdbFill(
  client: IgdbClient,
  id: number
): Promise<IgdbResult<IgdbGameFill | null>> {
  const result = await fetchIgdbGame(client, id)
  if (!result.ok) return result
  if (!result.data) return { ok: true, data: null }
  const { name, summary, releaseDate, developer, genres, requiredAge } = result.data
  return {
    ok: true,
    data: {
      name,
      summary,
      releaseDate,
      developer,
      genres: genres.map((genre) => GENRES_PT[genre] ?? genre),
      requiredAge
    }
  }
}

const SIXTEEN_NINE = 16 / 9
const RATIO_TOLERANCE = 0.05
/** Below this a background would look blurred on a TV. */
const MIN_BACKGROUND_WIDTH = 1280

const isBackground = (image: IgdbImage): boolean =>
  image.width !== null &&
  image.height !== null &&
  image.width >= MIN_BACKGROUND_WIDTH &&
  Math.abs(image.width / image.height - SIXTEEN_NINE) / SIXTEEN_NINE <= RATIO_TOLERANCE

/** The widest 16:9 image: official art first, then screenshots. Many artworks are not 16:9. */
export function pickIgdbBackground(game: IgdbGameData): IgdbImage | null {
  const widest = (images: IgdbImage[]): IgdbImage | null =>
    images
      .filter(isBackground)
      .reduce<IgdbImage | null>(
        (best, image) => (best === null || (image.width ?? 0) > (best.width ?? 0) ? image : best),
        null
      )
  return widest(game.artworks) ?? widest(game.screenshots)
}

/** An image address, from an id already validated by the schema above. */
export function igdbImageUrl(
  imageId: string,
  size: string,
  extension: 'jpg' | 'png' = 'jpg'
): string {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.${extension}`
}
