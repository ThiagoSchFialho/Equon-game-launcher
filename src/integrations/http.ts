/**
 * Minimal HTTP port for the integrations, so tests use fixtures instead of
 * live endpoints. URLs may carry API keys: callers never log them, and
 * errors never include them.
 */
export interface HttpResponse {
  status: number
  /** Parsed JSON body, or undefined when the body is not JSON. */
  json: unknown
}

export type HttpGet = (url: string, headers?: Record<string, string>) => Promise<HttpResponse>

/** Thrown for network failures and timeouts; the message never contains the URL. */
export class NetworkError extends Error {
  constructor() {
    super('Network request failed')
  }
}

/** HttpGet over the global fetch (Node / Electron main), 10 s timeout. */
export const fetchGet: HttpGet = async (url, headers) => {
  let response: Response
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new NetworkError()
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    json = undefined
  }
  return { status: response.status, json }
}

/** Downloads one image; null when the request failed or the body was too large. */
export type HttpGetBytes = (url: string) => Promise<Uint8Array | null>

/** Hosts artwork may be downloaded from (ARCHITECTURE.md §3.13); https only. */
// steamcdn-a.akamaihd.net serves the achievement icons (measured on 2026-11-04).
const IMAGE_HOSTS = [
  /\.steamstatic\.com$/,
  /^steamcdn-a\.akamaihd\.net$/,
  /^cdn2\.steamgriddb\.com$/
]

export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && IMAGE_HOSTS.some((host) => host.test(parsed.hostname))
  } catch {
    return false
  }
}

/** Reads a body and gives up at the limit: a server need not declare, or tell the truth about, its size. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** HttpGetBytes over the global fetch: allowlisted hosts only, size capped, 20 s timeout. */
export function createFetchBytes(maxBytes: number): HttpGetBytes {
  return async (url) => {
    if (!isAllowedImageUrl(url)) return null
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
      // A redirect must not leave the allowlist either.
      if (response.status !== 200 || !isAllowedImageUrl(response.url || url)) return null
      const declared = Number(response.headers.get('content-length') ?? 0)
      if (declared > maxBytes) {
        await response.body?.cancel()
        return null
      }
      return await readCapped(response, maxBytes)
    } catch {
      return null
    }
  }
}
