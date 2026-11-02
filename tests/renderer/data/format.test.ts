import { describe, expect, it } from 'vitest'
import {
  ageRatingKey,
  formatLastPlayed,
  formatPlaytime,
  releaseYear
} from '../../../src/renderer/src/data/format'
import { stepSection } from '../../../src/renderer/src/app/navigation'

describe('formatPlaytime', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h 0m'],
    [742, '12h 22m'],
    [-5, '0m']
  ])('%s min → %s', (minutes, text) => {
    expect(formatPlaytime(minutes)).toBe(text)
  })
})

describe('formatLastPlayed', () => {
  const now = new Date(2026, 10, 2, 15, 0) // local time
  const daysAgo = (n: number, hour = 12): string => new Date(2026, 10, 2 - n, hour).toISOString()

  it('counts local calendar days', () => {
    expect(formatLastPlayed(daysAgo(0, 1), now)).toBe('Hoje')
    expect(formatLastPlayed(daysAgo(1, 23), now)).toBe('Ontem')
    expect(formatLastPlayed(daysAgo(2), now)).toBe('Há 2 dias')
    expect(formatLastPlayed(daysAgo(29), now)).toBe('Há 29 dias')
  })

  it('switches to months and years', () => {
    expect(formatLastPlayed(daysAgo(30), now)).toBe('Há 1 mês')
    expect(formatLastPlayed(daysAgo(95), now)).toBe('Há 3 meses')
    expect(formatLastPlayed(daysAgo(400), now)).toBe('Há 1 ano')
    expect(formatLastPlayed(daysAgo(800), now)).toBe('Há 2 anos')
  })

  it('treats future or invalid dates as today', () => {
    expect(formatLastPlayed(daysAgo(-3), now)).toBe('Hoje')
    expect(formatLastPlayed('garbage', now)).toBe('Hoje')
  })
})

describe('releaseYear', () => {
  it('extracts the year', () => {
    expect(releaseYear('2011-04-18')).toBe('2011')
    expect(releaseYear(null)).toBeNull()
    expect(releaseYear('soon')).toBeNull()
  })
})

describe('ageRatingKey', () => {
  it.each([
    ['L', 'l'],
    ['l', 'l'],
    ['10', '10'],
    [' 18 ', '18'],
    ['0', 'pendente'],
    ['17', 'pendente'],
    ['', 'pendente'],
    [null, 'pendente']
  ] as const)('%s → %s', (age, key) => {
    expect(ageRatingKey(age)).toBe(key)
  })
})

describe('stepSection', () => {
  it('moves between sections without wrapping', () => {
    expect(stepSection('home', 1)).toBe('library')
    expect(stepSection('library', 1)).toBe('achievements')
    expect(stepSection('achievements', 1)).toBe('achievements')
    expect(stepSection('home', -1)).toBe('home')
  })
})
