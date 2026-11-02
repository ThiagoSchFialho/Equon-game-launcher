import { describe, expect, it } from 'vitest'
import { findNext, type Candidate, type Rect } from '../../../src/renderer/src/focus/spatial'

const cell = (col: number, row: number): Rect => ({
  left: col * 110,
  top: row * 110,
  width: 100,
  height: 100
})

// 3×3 grid, ids "c,r".
const grid: Candidate[] = []
for (let r = 0; r < 3; r++)
  for (let c = 0; c < 3; c++) grid.push({ id: `${c},${r}`, rect: cell(c, r) })
const others = (id: string): Candidate[] => grid.filter((g) => g.id !== id)

describe('findNext', () => {
  it('moves along rows and columns of a grid', () => {
    expect(findNext(cell(1, 1), others('1,1'), 'right')).toBe('2,1')
    expect(findNext(cell(1, 1), others('1,1'), 'left')).toBe('0,1')
    expect(findNext(cell(1, 1), others('1,1'), 'up')).toBe('1,0')
    expect(findNext(cell(1, 1), others('1,1'), 'down')).toBe('1,2')
  })

  it('returns null at the edge instead of wrapping', () => {
    expect(findNext(cell(2, 0), others('2,0'), 'right')).toBeNull()
    expect(findNext(cell(0, 0), others('0,0'), 'up')).toBeNull()
  })

  it('prefers an aligned element over a closer diagonal one', () => {
    const from: Rect = { left: 0, top: 0, width: 100, height: 100 }
    const candidates: Candidate[] = [
      { id: 'diagonal', rect: { left: 120, top: 150, width: 100, height: 100 } },
      { id: 'aligned', rect: { left: 300, top: 0, width: 100, height: 100 } }
    ]
    expect(findNext(from, candidates, 'right')).toBe('aligned')
  })

  it('moves down to the nearest element of a shorter last row', () => {
    const from = cell(2, 0)
    const lastRow: Candidate[] = [{ id: 'only', rect: cell(0, 1) }]
    expect(findNext(from, lastRow, 'down')).toBe('only')
  })
})
