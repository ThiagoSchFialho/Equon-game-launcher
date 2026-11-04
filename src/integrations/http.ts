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
