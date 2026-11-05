import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFetchBytes } from '../../src/integrations/http'

const URL_OK = 'https://cdn2.steamgriddb.com/a.png'

/** A body that does not declare its size, counting what was read from it. */
const streamed = (
  chunks: number,
  chunkSize: number
): { response: Response; pulled: () => number } => {
  let pulled = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled === chunks) controller.close()
      else {
        pulled++
        controller.enqueue(new Uint8Array(chunkSize).fill(7))
      }
    }
  })
  return { response: new Response(body, { status: 200 }), pulled: () => pulled }
}

afterEach(() => vi.unstubAllGlobals())

describe('createFetchBytes', () => {
  it('stops downloading as soon as an undeclared body passes the limit', async () => {
    const { response, pulled } = streamed(1000, 1024)
    vi.stubGlobal('fetch', async () => response)
    expect(await createFetchBytes(4096)(URL_OK)).toBeNull()
    expect(pulled()).toBeLessThan(20)
  })

  it('returns the whole image when it fits', async () => {
    const { response } = streamed(3, 1000)
    vi.stubGlobal('fetch', async () => response)
    const bytes = await createFetchBytes(4096)(URL_OK)
    expect(bytes?.length).toBe(3000)
    expect(bytes?.every((b) => b === 7)).toBe(true)
  })

  it('accepts an image of exactly the limit', async () => {
    const { response } = streamed(4, 1024)
    vi.stubGlobal('fetch', async () => response)
    expect((await createFetchBytes(4096)(URL_OK))?.length).toBe(4096)
  })

  it('refuses a declared size over the limit without reading the body', async () => {
    const { response, pulled } = streamed(10, 1024)
    response.headers.set('content-length', '99999')
    vi.stubGlobal('fetch', async () => response)
    expect(await createFetchBytes(4096)(URL_OK)).toBeNull()
    expect(pulled()).toBeLessThanOrEqual(1)
  })

  it('refuses hosts outside the allowlist without any request', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    expect(await createFetchBytes(4096)('https://evil.example/a.png')).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('a failed request is null, not an error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    expect(await createFetchBytes(4096)(URL_OK)).toBeNull()
  })
})

describe('APP_MENU', () => {
  it('offers only fullscreen and text editing', async () => {
    const { APP_MENU } = await import('../../src/main/app-menu')
    const roles = APP_MENU.flatMap((item) =>
      Array.isArray(item.submenu) ? item.submenu.map((sub) => sub.role) : []
    )
    expect(roles).toEqual(['togglefullscreen', 'undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])
  })
})
