import { describe, expect, it } from 'vitest'
import { playtimeMinutes, sessionDurationSeconds } from '../../../src/core/domain'

describe('playtimeMinutes', () => {
  it('floors the total, so leftover seconds accumulate across sessions', () => {
    // Rounding each session would give 0 + 0 + 0; the total is 90 s.
    expect(playtimeMinutes([30, 30, 30])).toBe(1)
    expect(playtimeMinutes([59])).toBe(0)
    expect(playtimeMinutes([])).toBe(0)
  })

  it('never goes negative', () => {
    expect(playtimeMinutes([-600, 120])).toBe(2)
  })
})

describe('sessionDurationSeconds', () => {
  it('returns whole seconds between two UTC timestamps', () => {
    expect(sessionDurationSeconds('2026-11-02T10:00:00Z', '2026-11-02T11:30:45Z')).toBe(5445)
  })

  it('clamps backwards clocks and invalid input to 0', () => {
    expect(sessionDurationSeconds('2026-11-02T10:00:00Z', '2026-11-02T09:00:00Z')).toBe(0)
    expect(sessionDurationSeconds('garbage', '2026-11-02T09:00:00Z')).toBe(0)
  })
})

describe('playtimeMinutes with a Steam baseline', () => {
  it('adds floored session time on top of the baseline', () => {
    expect(playtimeMinutes([50, 80], 600)).toBe(602)
    expect(playtimeMinutes([], 600)).toBe(600)
  })
})
