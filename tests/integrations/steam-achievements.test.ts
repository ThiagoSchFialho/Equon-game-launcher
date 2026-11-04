import { describe, expect, it } from 'vitest'
import { NetworkError, isAllowedImageUrl, type HttpGet } from '../../src/integrations/http'
import {
  fetchAchievementSchema,
  fetchGlobalPercentages,
  fetchPlayerAchievements
} from '../../src/integrations/steam/steam-achievements'

const KEY = 'ABCDEF0123456789ABCDEF0123456789'
const STEAM_ID = '76561197960287930'
const answer =
  (status: number, json: unknown): HttpGet =>
  async () => ({ status, json })
const offline: HttpGet = async () => {
  throw new NetworkError()
}

describe('fetchAchievementSchema', () => {
  it('maps definitions, keeps hidden ones without a description and asks for Portuguese', async () => {
    const urls: string[] = []
    const get: HttpGet = async (url) => {
      urls.push(url)
      return {
        status: 200,
        json: {
          game: {
            gameName: 'Balatro',
            availableGameStats: {
              achievements: [
                {
                  name: 'BAL_01',
                  defaultvalue: 0,
                  displayName: 'Aumento de Aposta!',
                  hidden: 0,
                  description: 'Alcance Aposta 4',
                  icon: 'https://steamcdn-a.akamaihd.net/a.jpg',
                  icongray: 'https://steamcdn-a.akamaihd.net/b.jpg'
                },
                { name: 'BAL_02', displayName: 'Segredo', hidden: 1 }
              ]
            }
          }
        }
      }
    }
    expect(await fetchAchievementSchema(get, KEY, 2379780)).toEqual({
      ok: true,
      data: [
        {
          apiName: 'BAL_01',
          displayName: 'Aumento de Aposta!',
          description: 'Alcance Aposta 4',
          icon: 'https://steamcdn-a.akamaihd.net/a.jpg',
          iconLocked: 'https://steamcdn-a.akamaihd.net/b.jpg'
        },
        {
          apiName: 'BAL_02',
          displayName: 'Segredo',
          description: null,
          icon: null,
          iconLocked: null
        }
      ]
    })
    expect(urls[0]).toContain('appid=2379780&l=brazilian')
  })

  it('treats an empty game as no achievements, not as a failure', async () => {
    expect(await fetchAchievementSchema(answer(200, { game: {} }), KEY, 1)).toEqual({
      ok: true,
      data: []
    })
    expect(
      await fetchAchievementSchema(
        answer(200, { game: { availableGameStats: { stats: [] } } }),
        KEY,
        1
      )
    ).toEqual({ ok: true, data: [] })
  })

  it('reports bad keys, bad bodies and network failures', async () => {
    expect(await fetchAchievementSchema(answer(403, null), KEY, 1)).toEqual({
      ok: false,
      error: 'invalid-key'
    })
    expect(await fetchAchievementSchema(answer(200, { other: 1 }), KEY, 1)).toEqual({
      ok: false,
      error: 'invalid-response'
    })
    expect(await fetchAchievementSchema(offline, KEY, 1)).toEqual({ ok: false, error: 'network' })
    expect(await fetchAchievementSchema(answer(200, {}), 'short', 1)).toEqual({
      ok: false,
      error: 'invalid-key'
    })
  })
})

describe('fetchPlayerAchievements', () => {
  it('maps unlock state and time; zero or locked means no date', async () => {
    const result = await fetchPlayerAchievements(
      answer(200, {
        playerstats: {
          success: true,
          achievements: [
            { apiname: 'A', achieved: 1, unlocktime: 1793750400 },
            { apiname: 'B', achieved: 1, unlocktime: 0 },
            { apiname: 'C', achieved: 0, unlocktime: 0 }
          ]
        }
      }),
      KEY,
      STEAM_ID,
      1
    )
    expect(result.ok && Object.fromEntries(result.data)).toEqual({
      A: { unlocked: true, unlockedAt: '2026-11-04T00:00:00Z' },
      B: { unlocked: true, unlockedAt: null },
      C: { unlocked: false, unlockedAt: null }
    })
  })

  it('never reads a failure as "everything locked"', async () => {
    expect(
      await fetchPlayerAchievements(
        answer(403, { playerstats: { error: 'Profile is not public', success: false } }),
        KEY,
        STEAM_ID,
        1
      )
    ).toEqual({ ok: false, error: 'private-profile' })
    expect(
      await fetchPlayerAchievements(
        answer(200, { playerstats: { success: false, error: 'x' } }),
        KEY,
        STEAM_ID,
        1
      )
    ).toEqual({ ok: false, error: 'invalid-response' })
    expect(
      await fetchPlayerAchievements(answer(200, { playerstats: {} }), KEY, STEAM_ID, 1)
    ).toEqual({ ok: false, error: 'invalid-response' })
    expect(await fetchPlayerAchievements(offline, KEY, STEAM_ID, 1)).toEqual({
      ok: false,
      error: 'network'
    })
  })
})

describe('fetchGlobalPercentages', () => {
  it('parses percentages sent as text and leaves out broken values', async () => {
    const result = await fetchGlobalPercentages(
      answer(200, {
        achievementpercentages: {
          achievements: [
            { name: 'A', percent: '89.8' },
            { name: 'B', percent: 5.5 },
            { name: 'C', percent: 'x' },
            { name: 'D', percent: '101' }
          ]
        }
      }),
      1
    )
    expect(result.ok && Object.fromEntries(result.data)).toEqual({ A: 89.8, B: 5.5 })
  })

  it('reports failures', async () => {
    expect(await fetchGlobalPercentages(answer(500, null), 1)).toEqual({
      ok: false,
      error: 'network'
    })
    expect(await fetchGlobalPercentages(answer(200, {}), 1)).toEqual({
      ok: false,
      error: 'invalid-response'
    })
  })
})

describe('icon host', () => {
  it('allows the Steam icon host exactly', () => {
    expect(isAllowedImageUrl('https://steamcdn-a.akamaihd.net/x/a.jpg')).toBe(true)
    expect(isAllowedImageUrl('https://evil-steamcdn-a.akamaihd.net/a.jpg')).toBe(false)
    expect(isAllowedImageUrl('https://steamcdn-a.akamaihd.net.evil.example/a.jpg')).toBe(false)
  })
})
