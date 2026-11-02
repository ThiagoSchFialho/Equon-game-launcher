import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AchievementRepository,
  AchievementUpsert,
  UserRepository
} from '../../../src/core/application'
import { isPlatinum, tierFromGlobalPercent } from '../../../src/core/domain'
import type { SqliteDatabase } from '../../../src/infrastructure/persistence'
import {
  createAchievementRepository,
  createUnitOfWork,
  createUserRepository
} from '../../../src/infrastructure/persistence'
import { createTestDb, insertGame } from '../../helpers/db'

let db: SqliteDatabase
let achievements: AchievementRepository
let users: UserRepository

beforeEach(() => {
  db = createTestDb()
  achievements = createAchievementRepository(db)
  users = createUserRepository(db)
})

function achievement(
  apiName: string,
  values: Partial<Omit<AchievementUpsert, 'apiName' | 'tier'>> = {}
): AchievementUpsert {
  const globalPercent = values.globalPercent ?? null
  return {
    apiName,
    displayName: values.displayName ?? apiName,
    description: values.description ?? null,
    icon: values.icon ?? null,
    unlocked: values.unlocked ?? false,
    unlockedAt: values.unlockedAt ?? null,
    globalPercent,
    tier: tierFromGlobalPercent(globalPercent)
  }
}

const totalChanges = (): number =>
  (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n

describe('AchievementRepository.upsertForGame', () => {
  it('inserts and updates by (game_id, api_name) without duplicates', () => {
    const id = insertGame(db)
    achievements.upsertForGame(id, [achievement('A'), achievement('B')])
    achievements.upsertForGame(id, [
      achievement('A', { unlocked: true, unlockedAt: '2026-11-01T10:00:00Z' })
    ])
    expect(achievements.progress(id)).toMatchObject({ total: 2, unlocked: 1 })
  })

  it('never deletes achievements missing from a later sync', () => {
    const id = insertGame(db)
    achievements.upsertForGame(id, [achievement('A'), achievement('B')])
    achievements.upsertForGame(id, [achievement('A')])
    expect(achievements.progress(id).total).toBe(2)
  })

  it('changes nothing when the same data is synced again', () => {
    const id = insertGame(db)
    const data = [
      achievement('A', { globalPercent: 12.5, unlocked: true, unlockedAt: '2026-11-01T10:00:00Z' }),
      achievement('B', { globalPercent: null })
    ]
    achievements.upsertForGame(id, data)
    const before = totalChanges()
    achievements.upsertForGame(id, data)
    expect(totalChanges()).toBe(before)
  })

  it('rolls back the whole batch on failure', () => {
    const id = insertGame(db)
    const bad = { ...achievement('B'), globalPercent: 150 }
    expect(() => achievements.upsertForGame(id, [achievement('A'), bad])).toThrow(/CHECK/)
    expect(achievements.progress(id).total).toBe(0)
  })
})

describe('AchievementRepository lists', () => {
  it('orders unlocked by date descending, unknown dates last, then name', () => {
    const id = insertGame(db)
    achievements.upsertForGame(id, [
      achievement('OLD', { unlocked: true, unlockedAt: '2026-01-01T00:00:00Z' }),
      achievement('NODATE_B', { unlocked: true, displayName: 'b' }),
      achievement('NEW', { unlocked: true, unlockedAt: '2026-11-01T00:00:00Z' }),
      achievement('NODATE_A', { unlocked: true, displayName: 'a' }),
      achievement('LOCKED')
    ])
    expect(achievements.listUnlocked(id).map((a) => a.apiName)).toEqual([
      'NEW',
      'OLD',
      'NODATE_A',
      'NODATE_B'
    ])
  })

  it('orders locked by global percent descending, unknown last, with stable ties', () => {
    const id = insertGame(db)
    achievements.upsertForGame(id, [
      achievement('RARE', { globalPercent: 2 }),
      achievement('UNKNOWN', { globalPercent: null }),
      achievement('COMMON', { globalPercent: 80 }),
      achievement('TIE_2', { globalPercent: 30, displayName: 'Same' }),
      achievement('TIE_1', { globalPercent: 30, displayName: 'Same' })
    ])
    expect(achievements.listLocked(id).map((a) => a.apiName)).toEqual([
      'COMMON',
      'TIE_1',
      'TIE_2',
      'RARE',
      'UNKNOWN'
    ])
  })

  it('keeps unknown global percent as null and maps tiers', () => {
    const id = insertGame(db)
    achievements.upsertForGame(id, [achievement('X'), achievement('G', { globalPercent: 10 })])
    const [gold, unknown] = achievements.listLocked(id)
    expect(gold).toMatchObject({ apiName: 'G', tier: 'gold', globalPercent: 10 })
    expect(unknown).toMatchObject({ apiName: 'X', tier: 'bronze', globalPercent: null })
  })
})

describe('AchievementRepository.progress', () => {
  it('is unavailable for a game with no known achievements', () => {
    const id = insertGame(db)
    expect(achievements.progress(id)).toEqual({
      total: 0,
      unlocked: 0,
      percent: null,
      platinum: false
    })
  })

  it('computes percent and platinum from the rows', () => {
    const id = insertGame(db)
    achievements.upsertForGame(id, [achievement('A', { unlocked: true }), achievement('B')])
    expect(achievements.progress(id)).toEqual({
      total: 2,
      unlocked: 1,
      percent: 50,
      platinum: false
    })
    achievements.upsertForGame(id, [achievement('B', { unlocked: true })])
    expect(achievements.progress(id)).toMatchObject({ percent: 100, platinum: true })
  })
})

describe('UserRepository trophy counters', () => {
  it('recomputes counters from ACHIEVEMENTS, in the same transaction as the upsert', () => {
    const uow = createUnitOfWork(db)
    const a = insertGame(db)
    const b = insertGame(db)
    const c = insertGame(db)

    const result = uow.transaction(() => {
      achievements.upsertForGame(a, [
        achievement('G', { globalPercent: 5, unlocked: true }),
        achievement('S', { globalPercent: 30, unlocked: true })
      ])
      achievements.upsertForGame(b, [
        achievement('B1', { globalPercent: 70, unlocked: true }),
        achievement('G2', { globalPercent: 1 })
      ])
      achievements.upsertForGame(c, [achievement('N', { unlocked: true })])
      return users.recomputeTrophyCounters()
    })

    // Unlocked: gold G, silver S, bronze B1 and N. Platinum: games a and c.
    expect(result).toEqual({ platine: 2, gold: 1, silver: 1, bronze: 2 })
    expect(users.getTrophyCounters()).toEqual(result)

    const rows = db.prepare('SELECT game_id, unlocked FROM achievements').all() as {
      game_id: number
      unlocked: number
    }[]
    const platinumGames = [a, b, c].filter((id) =>
      isPlatinum(rows.filter((r) => r.game_id === id).map((r) => ({ unlocked: r.unlocked === 1 })))
    )
    expect(platinumGames).toHaveLength(result.platine)
  })

  it('rolls back the upsert when the transaction fails', () => {
    const uow = createUnitOfWork(db)
    const id = insertGame(db)
    expect(() =>
      uow.transaction(() => {
        achievements.upsertForGame(id, [achievement('A', { unlocked: true })])
        users.recomputeTrophyCounters()
        throw new Error('sync failed')
      })
    ).toThrow('sync failed')
    expect(achievements.progress(id).total).toBe(0)
    expect(users.getTrophyCounters()).toEqual({ platine: 0, gold: 0, silver: 0, bronze: 0 })
  })

  it('never lets counters drift when recomputed repeatedly', () => {
    const id = insertGame(db)
    achievements.upsertForGame(id, [achievement('A', { unlocked: true })])
    users.recomputeTrophyCounters()
    expect(users.recomputeTrophyCounters()).toEqual({ platine: 1, gold: 0, silver: 0, bronze: 1 })
  })
})
