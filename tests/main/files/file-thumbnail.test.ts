import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createThumbnailFromPath = vi.fn(async () => ({
  isEmpty: () => false,
  toDataURL: () => 'data:image/png;base64,AAAA'
}))
vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  dialog: {},
  nativeImage: { createThumbnailFromPath }
}))

const { fileThumbnail, listFiles } = await import('../../../src/main/files/file-service')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'equon-thumbs-'))
  writeFileSync(join(dir, 'cover.png'), 'x')
  writeFileSync(join(dir, 'notes.txt'), 'x')
  mkdirSync(join(dir, 'inner'))
  writeFileSync(join(dir, 'inner', 'deep.jpg'), 'x')
  createThumbnailFromPath.mockClear()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('file browser previews (owner decision)', () => {
  it('makes a preview of an image in a folder just listed for images', async () => {
    expect(listFiles(dir, 'image').ok).toBe(true)
    expect(await fileThumbnail(join(dir, 'cover.png'))).toBe('data:image/png;base64,AAAA')
    expect(createThumbnailFromPath).toHaveBeenCalledWith(join(dir, 'cover.png'), {
      width: 160,
      height: 90
    })
  })

  it('gives nothing outside the folders listed, or for what is not an image', async () => {
    listFiles(dir, 'image')
    // A folder never listed: the renderer cannot ask for any file on the disk.
    expect(await fileThumbnail(join(dir, 'inner', 'deep.jpg'))).toBeNull()
    expect(await fileThumbnail(join(dir, 'notes.txt'))).toBeNull()
    expect(await fileThumbnail('cover.png')).toBeNull()
    expect(createThumbnailFromPath).not.toHaveBeenCalled()
  })

  it('gives nothing for a folder listed for executables', async () => {
    const other = mkdtempSync(join(tmpdir(), 'equon-thumbs-exe-'))
    writeFileSync(join(other, 'shot.png'), 'x')
    try {
      listFiles(other, 'executable')
      expect(await fileThumbnail(join(other, 'shot.png'))).toBeNull()
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  it('gives nothing when Windows cannot make one', async () => {
    listFiles(dir, 'image')
    createThumbnailFromPath.mockRejectedValueOnce(new Error('unsupported'))
    expect(await fileThumbnail(join(dir, 'cover.png'))).toBeNull()
  })
})
