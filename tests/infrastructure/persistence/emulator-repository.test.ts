import { describe, expect, it } from 'vitest'
import { createEmulatorRepository } from '../../../src/infrastructure/persistence'
import { createTestDb } from '../../helpers/db'

describe('EmulatorRepository', () => {
  it('sets, replaces, reads and removes the Yuzu executable', () => {
    const emulators = createEmulatorRepository(createTestDb())
    expect(emulators.list()).toEqual([])
    expect(emulators.get('yuzu')).toBeNull()
    emulators.set('yuzu', 'C:/Yuzu/yuzu.exe')
    expect(emulators.set('yuzu', 'D:/Yuzu/yuzu.exe')).toEqual({
      key: 'yuzu',
      executablePath: 'D:/Yuzu/yuzu.exe'
    })
    expect(emulators.list()).toHaveLength(1)
    expect(emulators.remove('yuzu')).toBe(true)
    expect(emulators.remove('yuzu')).toBe(false)
  })
})
