import { z } from 'zod'
import { NetworkError, type HttpPost, type HttpResponse } from '../http'

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API = 'https://api.igdb.com/v4'
const CREDENTIAL = /^[A-Za-z0-9]{16,128}$/
/** Renew a little before Twitch would refuse the token. */
const EXPIRY_MARGIN_MS = 60_000

export type IgdbError =
  'not-configured' | 'invalid-key' | 'network' | 'unavailable' | 'invalid-response'
export type IgdbResult<T> = { ok: true; data: T } | { ok: false; error: IgdbError }

export interface IgdbCredentials {
  clientId: string | null
  clientSecret: string | null
}

export interface IgdbClient {
  /** One Apicalypse query; the token is handled here. The body comes from code, not from input. */
  query(endpoint: string, body: string): Promise<IgdbResult<unknown>>
  /** "Testar conexão": gets a token and asks for one game. */
  test(): Promise<IgdbResult<true>>
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive()
})

/**
 * IGDB through its Twitch app credentials (D-18). The secret goes in the request body and
 * never in a URL, and the token lives only in memory: Twitch gives a new one at any time.
 */
export function createIgdbClient(deps: {
  post: HttpPost
  credentials(): IgdbCredentials
  now(): number
}): IgdbClient {
  let cached: { clientId: string; clientSecret: string; token: string; expiresAt: number } | null =
    null

  const send = async (
    url: string,
    headers: Record<string, string>,
    body: string
  ): Promise<HttpResponse | null> => {
    try {
      return await deps.post(url, headers, body)
    } catch (error) {
      if (error instanceof NetworkError) return null
      throw error
    }
  }

  const getToken = async (clientId: string, clientSecret: string): Promise<IgdbResult<string>> => {
    if (
      cached &&
      cached.clientId === clientId &&
      cached.clientSecret === clientSecret &&
      deps.now() < cached.expiresAt
    ) {
      return { ok: true, data: cached.token }
    }
    cached = null
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    })
    const response = await send(
      TOKEN_URL,
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      form.toString()
    )
    if (response === null) return { ok: false, error: 'network' }
    // Twitch answers 400 or 403 to a wrong client id or secret.
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { ok: false, error: 'invalid-key' }
    }
    if (response.status !== 200) return { ok: false, error: 'unavailable' }
    const parsed = tokenSchema.safeParse(response.json)
    if (!parsed.success) return { ok: false, error: 'invalid-response' }
    cached = {
      clientId,
      clientSecret,
      token: parsed.data.access_token,
      expiresAt: deps.now() + parsed.data.expires_in * 1000 - EXPIRY_MARGIN_MS
    }
    return { ok: true, data: cached.token }
  }

  const query: IgdbClient['query'] = async (endpoint, body) => {
    const { clientId, clientSecret } = deps.credentials()
    if (!clientId || !clientSecret) return { ok: false, error: 'not-configured' }
    if (!CREDENTIAL.test(clientId) || !CREDENTIAL.test(clientSecret)) {
      return { ok: false, error: 'invalid-key' }
    }
    // A refused token may just be old: one new attempt, no more.
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getToken(clientId, clientSecret)
      if (!token.ok) return token
      const response = await send(
        `${API}/${endpoint}`,
        {
          'Client-ID': clientId,
          Authorization: `Bearer ${token.data}`,
          Accept: 'application/json',
          'Content-Type': 'text/plain'
        },
        body
      )
      if (response === null) return { ok: false, error: 'network' }
      if (response.status === 401) {
        cached = null
        continue
      }
      if (response.status === 403) return { ok: false, error: 'invalid-key' }
      if (response.status !== 200) return { ok: false, error: 'unavailable' }
      return response.json === undefined
        ? { ok: false, error: 'invalid-response' }
        : { ok: true, data: response.json }
    }
    return { ok: false, error: 'invalid-key' }
  }

  return {
    query,
    async test() {
      const result = await query('games', 'fields id; limit 1;')
      if (!result.ok) return result
      return Array.isArray(result.data)
        ? { ok: true, data: true }
        : { ok: false, error: 'invalid-response' }
    }
  }
}
