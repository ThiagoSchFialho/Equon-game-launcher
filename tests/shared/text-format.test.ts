import { describe, expect, it } from 'vitest'
import {
  daysInMonth,
  formatArguments,
  isoToDisplayDate,
  parseArguments,
  toIsoDate
} from '../../src/shared/text-format'

describe('parseArguments', () => {
  it.each([
    ['', []],
    ['  -w   -fullscreen ', ['-w', '-fullscreen']],
    ['-rom "D:\\ROMs\\My Game.iso"', ['-rom', 'D:\\ROMs\\My Game.iso']],
    ['--path="C:\\Program Files\\X"', ['--path=C:\\Program Files\\X']],
    ['"" a', ['', 'a']],
    ['"unterminated quote', ['unterminated quote']],
    ['&& del *', ['&&', 'del', '*']]
  ])('%j → %j', (line, args) => {
    expect(parseArguments(line)).toEqual(args)
  })
})

describe('formatArguments', () => {
  it('quotes arguments with spaces and round-trips', () => {
    const args = ['-rom', 'D:\\ROMs\\My Game.iso', '', '-w']
    const line = formatArguments(args)
    expect(line).toBe('-rom "D:\\ROMs\\My Game.iso" "" -w')
    expect(parseArguments(line)).toEqual(args)
  })
})

describe('dates', () => {
  it('converts ISO dates for display', () => {
    expect(isoToDisplayDate('2004-03-01')).toBe('01-03-2004')
    expect(isoToDisplayDate(null)).toBeNull()
    expect(isoToDisplayDate('soon')).toBeNull()
  })

  it('builds ISO dates, clamping the day', () => {
    expect(toIsoDate(2004, 3, 1)).toBe('2004-03-01')
    expect(toIsoDate(2023, 2, 31)).toBe('2023-02-28')
    expect(toIsoDate(2024, 2, 31)).toBe('2024-02-29')
    expect(daysInMonth(2024, 12)).toBe(31)
  })
})
