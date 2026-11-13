import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  folderKey,
  folderSize,
  isSummableFolder
} from '../../src/infrastructure/filesystem/folder-size'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'equon-size-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const file = (path: string, bytes: number): void => {
  mkdirSync(join(dir, path, '..'), { recursive: true })
  writeFileSync(join(dir, path), Buffer.alloc(bytes))
}

describe('folderSize (D-34)', () => {
  it('sums every file under the folder, subfolders included', async () => {
    file('game.exe', 100)
    file('data/a.pak', 250)
    file('data/deep/b.pak', 50)
    expect(await folderSize(dir)).toEqual({ status: 'ok', bytes: 400, truncated: false })
  })

  it('does not follow links or junctions, so nothing is counted twice', async () => {
    file('game.exe', 100)
    file('outside/huge.bin', 5000)
    mkdirSync(join(dir, 'game'))
    file('game/game.exe', 100)
    // A junction needs no admin rights on Windows.
    symlinkSync(join(dir, 'outside'), join(dir, 'game', 'link'), 'junction')
    expect(await folderSize(join(dir, 'game'))).toEqual({
      status: 'ok',
      bytes: 100,
      truncated: false
    })
  })

  it('stops at its file limit and says the size is at least that', async () => {
    for (let i = 0; i < 5; i++) file(`f${i}.bin`, 10)
    const result = await folderSize(dir, { maxFiles: 3 })
    expect(result).toEqual({ status: 'ok', bytes: 30, truncated: true })
  })

  it('stops at its time limit', async () => {
    file('a.bin', 10)
    file('b.bin', 10)
    let clock = 0
    const result = await folderSize(dir, { maxMs: 5, now: () => (clock += 10) })
    expect(result).toMatchObject({ status: 'ok', truncated: true })
  })

  it('reports a folder it cannot open', async () => {
    expect(await folderSize(join(dir, 'missing'))).toEqual({ status: 'unreadable' })
  })
})

describe('isSummableFolder', () => {
  const system = ['C:\\Program Files', 'C:\\Users\\me']

  it('refuses drive roots and system folders, however they are spelled', () => {
    expect(isSummableFolder('D:\\', system)).toBe(false)
    expect(isSummableFolder('c:\\program files\\', system)).toBe(false)
    expect(isSummableFolder('C:\\Users\\Me', system)).toBe(false)
  })

  it('accepts a game folder, also one inside a system folder', () => {
    expect(isSummableFolder('C:\\Program Files\\Some Game', system)).toBe(true)
    expect(isSummableFolder('D:\\Games\\Hollow Knight', system)).toBe(true)
  })

  it('compares folders without case or a trailing slash', () => {
    expect(folderKey('D:\\Games\\X\\')).toBe(folderKey('d:\\games\\x'))
  })
})
