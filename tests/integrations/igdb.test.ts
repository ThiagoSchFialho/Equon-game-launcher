import { describe, expect, it, vi, type Mock } from 'vitest'
import { NetworkError, type HttpPost } from '../../src/integrations/http'
import {
  fetchIgdbFill,
  fetchIgdbGame,
  fetchIgdbSteamGame,
  igdbImageUrl,
  pickIgdbBackground,
  searchIgdbGames,
  type IgdbImage
} from '../../src/integrations/igdb/games'
import { createIgdbClient, type IgdbClient } from '../../src/integrations/igdb/igdb'

const ID = 'clientid0123456789abcdefghijkl'
const SECRET = 'secret0123456789abcdefghijklmn'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'

/** Twitch and IGDB answers by URL; every call is recorded. */
type Answer = { status: number; json: unknown } | 'offline'
type Credentials = { clientId: string | null; clientSecret: string | null }
interface Setup {
  client: IgdbClient
  calls: { url: string; headers: Record<string, string>; body: string }[]
  credentials: Mock<() => Credentials>
  advance(ms: number): void
}

const setup = (answers: { token?: Answer; api?: Answer[] }): Setup => {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = []
  const api = [...(answers.api ?? [])]
  const post: HttpPost = async (url, headers, body) => {
    calls.push({ url, headers, body })
    const answer =
      url === TOKEN_URL
        ? (answers.token ?? { status: 200, json: { access_token: 'tok', expires_in: 3600 } })
        : (api.shift() ?? { status: 200, json: [{ id: 1 }] })
    if (answer === 'offline') throw new NetworkError()
    return answer
  }
  let time = 1_000_000
  const credentials = vi.fn((): Credentials => ({ clientId: ID, clientSecret: SECRET }))
  const client = createIgdbClient({ post, credentials, now: () => time })
  return { client, calls, credentials, advance: (ms) => void (time += ms) }
}
const tokens = (calls: { url: string }[]): number => calls.filter((c) => c.url === TOKEN_URL).length

describe('IGDB client', () => {
  it('sends the query with the token and the client id, and the secret only in a body', async () => {
    const { client, calls } = setup({})
    expect(await client.query('games', 'fields name;')).toEqual({ ok: true, data: [{ id: 1 }] })
    expect(calls[0].url).toBe(TOKEN_URL)
    expect(calls[0].body).toContain(`client_secret=${SECRET}`)
    expect(calls[1]).toMatchObject({
      url: 'https://api.igdb.com/v4/games',
      body: 'fields name;'
    })
    expect(calls[1].headers).toMatchObject({ 'Client-ID': ID, Authorization: 'Bearer tok' })
    for (const call of calls) expect(call.url).not.toContain(SECRET)
    expect(calls[1].body).not.toContain(SECRET)
    expect(JSON.stringify(calls[1].headers)).not.toContain(SECRET)
  })

  it('reuses the token until it is about to expire', async () => {
    const { client, calls, advance } = setup({})
    await client.query('games', 'a')
    await client.query('games', 'b')
    expect(tokens(calls)).toBe(1)
    advance(3600 * 1000 - 30_000) // inside the safety margin
    await client.query('games', 'c')
    expect(tokens(calls)).toBe(2)
  })

  it('asks for a new token when the credentials change', async () => {
    const { client, calls, credentials } = setup({})
    await client.query('games', 'a')
    credentials.mockReturnValue({ clientId: ID, clientSecret: SECRET + 'x' })
    await client.query('games', 'b')
    expect(tokens(calls)).toBe(2)
  })

  it('a refused token gets one new attempt, and not more', async () => {
    const once = setup({
      api: [
        { status: 401, json: null },
        { status: 200, json: [] }
      ]
    })
    expect(await once.client.query('games', 'a')).toEqual({ ok: true, data: [] })
    expect(tokens(once.calls)).toBe(2)

    const always = setup({
      api: [
        { status: 401, json: null },
        { status: 401, json: null },
        { status: 200, json: [] }
      ]
    })
    expect(await always.client.query('games', 'a')).toEqual({ ok: false, error: 'invalid-key' })
    expect(always.calls).toHaveLength(4)
  })

  it('tells each failure apart, and never asks without credentials', async () => {
    const none = setup({})
    none.credentials.mockReturnValue({ clientId: null, clientSecret: SECRET })
    expect(await none.client.test()).toEqual({ ok: false, error: 'not-configured' })
    expect(none.calls).toEqual([])

    const malformed = setup({})
    malformed.credentials.mockReturnValue({ clientId: 'short', clientSecret: SECRET })
    expect(await malformed.client.test()).toEqual({ ok: false, error: 'invalid-key' })
    expect(malformed.calls).toEqual([])

    const check = async (answers: Parameters<typeof setup>[0], error: string): Promise<void> => {
      expect(await setup(answers).client.test()).toEqual({ ok: false, error })
    }
    await check(
      { token: { status: 403, json: { message: 'invalid client secret' } } },
      'invalid-key'
    )
    await check({ token: { status: 400, json: { message: 'invalid client' } } }, 'invalid-key')
    await check({ token: { status: 503, json: null } }, 'unavailable')
    await check({ token: { status: 200, json: { nope: 1 } } }, 'invalid-response')
    await check({ token: 'offline' }, 'network')
    await check({ api: ['offline'] }, 'network')
    await check({ api: [{ status: 429, json: null }] }, 'unavailable')
    await check({ api: [{ status: 403, json: null }] }, 'invalid-key')
    await check({ api: [{ status: 200, json: { not: 'a list' } }] }, 'invalid-response')
  })

  it('the connection test succeeds with a list', async () => {
    const { client, calls } = setup({})
    expect(await client.test()).toEqual({ ok: true, data: true })
    expect(calls[1].body).toBe('fields id; limit 1;')
  })
})

describe('IGDB games', () => {
  const client = (answers: unknown[]): { client: IgdbClient; bodies: string[] } => {
    const bodies: string[] = []
    const queue = [...answers]
    return {
      bodies,
      client: {
        test: async () => ({ ok: true, data: true }),
        query: async (_endpoint, body) => {
          bodies.push(body)
          const answer = queue.shift()
          return answer === 'offline' ? { ok: false, error: 'network' } : { ok: true, data: answer }
        }
      }
    }
  }

  it('puts the exact name first, then the best known, without add-ons or versions', async () => {
    const fake = client([
      [
        { id: 1, name: 'Doom Mod', game_type: { type: 'Mod' } },
        { id: 2, name: 'Doom Eternal', total_rating_count: 500, game_type: { type: 'Main Game' } },
        { id: 3, name: 'Doom Port', version_parent: 9 },
        {
          id: 4,
          name: ' doom ',
          total_rating_count: 10,
          first_release_date: 1464912000,
          game_type: { type: 'Main Game' },
          involved_companies: [
            { developer: false, company: { name: 'Publisher' } },
            { developer: true, company: { name: 'id Software' } }
          ]
        },
        { name: 'no id' }
      ]
    ])
    const result = await searchIgdbGames(fake.client, 'Doom')
    expect(result).toEqual({
      ok: true,
      data: [
        { id: 4, name: 'doom', year: 2016, developer: 'id Software' },
        { id: 2, name: 'Doom Eternal', year: null, developer: null }
      ]
    })
  })

  it('does not let a typed name end the query', async () => {
    const fake = client([[]])
    await searchIgdbGames(fake.client, 'a"; fields *; \\\n')
    expect(fake.bodies[0].startsWith('search "a ; fields *;";')).toBe(true)
    expect(fake.bodies[0].match(/"/g)).toHaveLength(2)
  })

  it('does not ask anything for an empty name', async () => {
    const fake = client([])
    expect(await searchIgdbGames(fake.client, '   ')).toEqual({ ok: true, data: [] })
    expect(fake.bodies).toEqual([])
  })

  it.each([
    ['not a list', { id: 1 }],
    ['a string', 'x'],
    ['nothing', undefined]
  ])('rejects a malformed search answer: %s', async (_label, answer) => {
    expect(await searchIgdbGames(client([answer]).client, 'x')).toEqual({
      ok: false,
      error: 'invalid-response'
    })
  })

  const FULL = {
    name: ' Hollow ',
    summary: ' Text ',
    first_release_date: 1487894400,
    genres: [{ name: 'Role-playing (RPG)' }, { name: 'Brand New Genre' }, { bad: true }],
    involved_companies: [{ developer: true, company: { name: 'Team' } }],
    age_ratings: [
      { organization: { name: 'ESRB' }, rating_category: { rating: 'T' } },
      { organization: { name: 'CLASS_IND' }, rating_category: { rating: 'CLASS_IND_TWELVE' } }
    ],
    cover: { image_id: 'abc', width: 810, height: 1080 },
    artworks: [{ image_id: 'art', width: 1920, height: 1080 }, { image_id: '../evil' }],
    screenshots: []
  }

  it('reads one game, skipping broken entries, with its logos', async () => {
    const fake = client([[FULL], [{ image_id: 'log', width: 800, height: 300 }]])
    const result = await fetchIgdbGame(fake.client, 7)
    expect(result).toEqual({
      ok: true,
      data: {
        name: 'Hollow',
        summary: 'Text',
        releaseDate: '2017-02-24',
        developer: 'Team',
        genres: ['Role-playing (RPG)', 'Brand New Genre'],
        requiredAge: '12',
        cover: { imageId: 'abc', width: 810, height: 1080 },
        artworks: [{ imageId: 'art', width: 1920, height: 1080 }],
        screenshots: [],
        logos: [{ imageId: 'log', width: 800, height: 300 }]
      }
    })
    expect(fake.bodies[1]).toContain('where game = 7')
  })

  it('leaves the rating empty when ClassInd has not rated the game', async () => {
    const fake = client([[{ ...FULL, age_ratings: [FULL.age_ratings[0]] }], []])
    const result = await fetchIgdbGame(fake.client, 7)
    expect(result.ok && result.data?.requiredAge).toBeNull()
  })

  it('answers null for an unknown game and fails when the logos cannot be read', async () => {
    expect(await fetchIgdbGame(client([[]]).client, 7)).toEqual({ ok: true, data: null })
    expect(await fetchIgdbGame(client([[FULL], 'offline']).client, 7)).toEqual({
      ok: false,
      error: 'network'
    })
    expect(await fetchIgdbGame(client([[{ summary: 'no name' }]]).client, 7)).toEqual({
      ok: false,
      error: 'invalid-response'
    })
  })

  it('finds a Steam game by its App ID, not by name', async () => {
    const fake = client([[{ game: 7 }], [FULL], []])
    const result = await fetchIgdbSteamGame(fake.client, 620)
    expect(result.ok && result.data?.name).toBe('Hollow')
    expect(fake.bodies[0]).toContain('where external_game_source = 1 & uid = "620"')
    expect(fake.bodies[1]).toContain('where id = 7')
  })

  it('answers null for a Steam game IGDB does not know, and reports bad answers', async () => {
    expect(await fetchIgdbSteamGame(client([[]]).client, 620)).toEqual({ ok: true, data: null })
    const none = client([])
    expect(await fetchIgdbSteamGame(none.client, -1)).toEqual({ ok: true, data: null })
    expect(none.bodies).toEqual([])
    expect(await fetchIgdbSteamGame(client(['offline']).client, 620)).toEqual({
      ok: false,
      error: 'network'
    })
    expect(await fetchIgdbSteamGame(client([{ game: 7 }]).client, 620)).toEqual({
      ok: false,
      error: 'invalid-response'
    })
  })

  it('gives the form translated genres and no images', async () => {
    const result = await fetchIgdbFill(client([[FULL], []]).client, 7)
    expect(result).toEqual({
      ok: true,
      data: {
        name: 'Hollow',
        summary: 'Text',
        releaseDate: '2017-02-24',
        developer: 'Team',
        genres: ['RPG', 'Brand New Genre'],
        requiredAge: '12'
      }
    })
  })

  it('chooses the widest 16:9 image, official art before screenshots', () => {
    const base = { cover: null, logos: [] } as unknown as Parameters<typeof pickIgdbBackground>[0]
    const image = (imageId: string, width: number | null, height: number | null): IgdbImage => ({
      imageId,
      width,
      height
    })
    expect(
      pickIgdbBackground({
        ...base,
        artworks: [image('tall', 1000, 1500), image('small', 1280, 720), image('big', 2560, 1440)],
        screenshots: [image('shot', 3840, 2160)]
      })?.imageId
    ).toBe('big')
    expect(
      pickIgdbBackground({
        ...base,
        artworks: [image('tall', 1000, 1500), image('unknown', null, null)],
        screenshots: [image('shot', 1920, 1080), image('tiny', 640, 360)]
      })?.imageId
    ).toBe('shot')
    expect(
      pickIgdbBackground({ ...base, artworks: [], screenshots: [image('tiny', 640, 360)] })
    ).toBeNull()
  })

  it('builds image addresses', () => {
    expect(igdbImageUrl('abc', '1080p')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_1080p/abc.jpg'
    )
    expect(igdbImageUrl('abc', '1080p', 'png')).toMatch(/abc\.png$/)
  })
})
