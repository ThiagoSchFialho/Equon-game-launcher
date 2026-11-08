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
      executablePath: 'D:/Yuzu/yuzu.exe',
      romDirectory: null
    })
    expect(emulators.list()).toHaveLength(1)
    expect(emulators.remove('yuzu')).toBe(true)
    expect(emulators.remove('yuzu')).toBe(false)
  })

  it('keeps a ROM folder only for a configured emulator, through a change of executable', () => {
    const emulators = createEmulatorRepository(createTestDb())
    expect(emulators.setRomDirectory('yuzu', 'D:/Roms')).toBeNull()
    expect(emulators.get('yuzu')).toBeNull()

    emulators.set('yuzu', 'C:/Yuzu/yuzu.exe')
    expect(emulators.setRomDirectory('yuzu', 'D:/Roms')).toMatchObject({ romDirectory: 'D:/Roms' })
    expect(emulators.set('yuzu', 'D:/Yuzu/yuzu.exe').romDirectory).toBe('D:/Roms')
    expect(emulators.setRomDirectory('yuzu', null)?.romDirectory).toBeNull()

    // Removing the emulator takes its folder along.
    emulators.setRomDirectory('yuzu', 'D:/Roms')
    emulators.remove('yuzu')
    emulators.set('yuzu', 'C:/Yuzu/yuzu.exe')
    expect(emulators.get('yuzu')?.romDirectory).toBeNull()
  })
})
