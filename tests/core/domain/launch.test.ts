import { describe, expect, it } from 'vitest'
import { isAllowedExecutableName } from '../../../src/core/domain'
import { applyRomToArguments } from '../../../src/shared/text-format'

describe('applyRomToArguments', () => {
  it('replaces every {rom} placeholder', () => {
    expect(applyRomToArguments(['-f', '--rom={rom}', '{rom}'], 'D:/a b.iso')).toEqual([
      '-f',
      '--rom=D:/a b.iso',
      'D:/a b.iso'
    ])
  })

  it('appends the ROM when there is no placeholder', () => {
    expect(applyRomToArguments(['-fullscreen'], 'D:/x.iso')).toEqual(['-fullscreen', 'D:/x.iso'])
    expect(applyRomToArguments([], 'D:/x.iso')).toEqual(['D:/x.iso'])
  })
})

describe('isAllowedExecutableName', () => {
  it('accepts only .exe files', () => {
    expect(isAllowedExecutableName('C:/Games/Game.EXE')).toBe(true)
    expect(isAllowedExecutableName('C:/Games/run.bat')).toBe(false)
    expect(isAllowedExecutableName('C:/Games/run.cmd')).toBe(false)
    expect(isAllowedExecutableName('C:/Games/Game.lnk')).toBe(false)
    expect(isAllowedExecutableName('C:/Games/exe')).toBe(false)
  })
})
