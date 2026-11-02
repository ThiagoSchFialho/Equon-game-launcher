import { describe, expect, it } from 'vitest'
import {
  isPlatinum,
  personalProgressPercent,
  tierFromGlobalPercent
} from '../../../src/core/domain'

describe('tierFromGlobalPercent', () => {
  it.each([
    [0, 'gold'],
    [15, 'gold'],
    [15.01, 'silver'],
    [49.99, 'silver'],
    [50, 'bronze'],
    [100, 'bronze'],
    [null, 'bronze']
  ] as const)('%s → %s', (percent, tier) => {
    expect(tierFromGlobalPercent(percent)).toBe(tier)
  })
})

describe('isPlatinum', () => {
  it('requires at least one achievement', () => {
    expect(isPlatinum([])).toBe(false)
  })

  it('requires every achievement unlocked', () => {
    expect(isPlatinum([{ unlocked: true }, { unlocked: true }])).toBe(true)
    expect(isPlatinum([{ unlocked: true }, { unlocked: false }])).toBe(false)
  })
})

describe('personalProgressPercent', () => {
  it('is unavailable (null) with zero known achievements, without dividing', () => {
    expect(personalProgressPercent(0, 0)).toBeNull()
  })

  it('computes unlocked / total × 100', () => {
    expect(personalProgressPercent(1, 4)).toBe(25)
    expect(personalProgressPercent(3, 3)).toBe(100)
  })
})
