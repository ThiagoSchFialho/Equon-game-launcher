import { describe, expect, it } from 'vitest'
import { parseDrives } from '../../../src/main/system/drives'

describe('parseDrives', () => {
  it('reads what the script printed on the owner’s PC', () => {
    const output =
      '[{"label":"","size":238887628800,"type":3,"free":81123536896,"letter":"C:"},' +
      '{"label":"SSD","size":1000203087872,"type":3,"free":206632693760,"letter":"D:"}]'
    expect(parseDrives(output)).toEqual([
      {
        letter: 'C:',
        label: null,
        removable: false,
        totalBytes: 238887628800,
        freeBytes: 81123536896
      },
      {
        letter: 'D:',
        label: 'SSD',
        removable: false,
        totalBytes: 1000203087872,
        freeBytes: 206632693760
      }
    ])
  })

  it('keeps local and removable disks, and leaves out the rest', () => {
    const row = (letter: string, type: number): object => ({
      letter,
      label: null,
      type,
      size: 100,
      free: 50
    })
    const drives = parseDrives(
      JSON.stringify([row('Z:', 4), row('F:', 2), row('C:', 3), row('G:', 5)])
    )
    expect(drives?.map((d) => [d.letter, d.removable])).toEqual([
      ['C:', false],
      ['F:', true]
    ])
  })

  it('leaves out a reader with no card in it, which has no size', () => {
    expect(parseDrives('[{"letter":"G:","label":null,"type":2,"size":null,"free":null}]')).toEqual(
      []
    )
  })

  it('never reports more free space than the disk has', () => {
    expect(
      parseDrives('[{"letter":"C:","label":null,"type":3,"size":100,"free":200}]')?.[0].freeBytes
    ).toBe(100)
  })

  it('ignores anything else', () => {
    for (const output of [
      '',
      'garbage',
      '{}',
      '[{"letter":"C"}]',
      '[{"letter":"../x","type":3}]'
    ]) {
      expect(parseDrives(output), output).toBeNull()
    }
  })
})
