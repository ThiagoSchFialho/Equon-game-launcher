import { describe, expect, it } from 'vitest'
import { normalizeGenreName, originKeyFromName, toUtcIso } from '../../../src/core/domain'

describe('normalizeGenreName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeGenreName('  Massively   Multiplayer ')).toBe('Massively Multiplayer')
  })
})

describe('originKeyFromName', () => {
  it.each([
    ['Nintendo 64', 'nintendo-64'],
    ['  PlayStation   3 ', 'playstation-3'],
    ['Pokémon Mini', 'pokemon-mini'],
    ['Game Boy / Color', 'game-boy-color']
  ])('%s → %s', (name, key) => {
    expect(originKeyFromName(name)).toBe(key)
  })

  it('returns null when nothing usable remains', () => {
    expect(originKeyFromName('  ***  ')).toBeNull()
    expect(originKeyFromName('')).toBeNull()
  })
})

describe('toUtcIso', () => {
  it('formats UTC with second precision', () => {
    expect(toUtcIso(new Date(Date.UTC(2026, 10, 1, 12, 34, 56, 789)))).toBe('2026-11-01T12:34:56Z')
  })
})
