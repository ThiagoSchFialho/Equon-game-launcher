import { NetworkError, type HttpGet } from '../http'

const API = 'https://www.steamgriddb.com/api/v2'

export type SteamGridDbTestResult = 'ok' | 'invalid-key' | 'network' | 'invalid-response'

/**
 * Checks the user's key with one authenticated request (Settings › "Testar
 * conexão"). The key goes in the Authorization header, never in the URL.
 */
export async function testSteamGridDbKey(
  get: HttpGet,
  key: string
): Promise<SteamGridDbTestResult> {
  if (!/^[A-Za-z0-9]{16,128}$/.test(key)) return 'invalid-key'
  try {
    // A known game (Portal 2) keeps the answer small and stable.
    const response = await get(`${API}/games/steam/620`, { Authorization: `Bearer ${key}` })
    if (response.status === 401 || response.status === 403) return 'invalid-key'
    if (response.status !== 200) return 'network'
    const body = response.json as { success?: unknown } | undefined
    return body?.success === true ? 'ok' : 'invalid-response'
  } catch (error) {
    if (error instanceof NetworkError) return 'network'
    throw error
  }
}
