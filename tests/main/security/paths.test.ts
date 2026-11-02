import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveInside } from '../../../src/main/security/paths'

const root = resolve('/data/artwork-cache')

describe('resolveInside', () => {
  it('resolves relative paths inside the root', () => {
    expect(resolveInside(root, '12/cover_square.png')).toBe(join(root, '12', 'cover_square.png'))
    expect(resolveInside(root, '12\\logo.png')).toBe(join(root, '12', 'logo.png'))
  })

  it('rejects escapes, absolute paths, other drives and the root itself', () => {
    for (const bad of [
      '../secret.txt',
      '12/../../secret.txt',
      '..\\..\\Windows\\win.ini',
      resolve('/etc/passwd'),
      'C:\\Windows\\win.ini',
      '\\\\server\\share\\x.png',
      '',
      '.'
    ]) {
      expect(resolveInside(root, bad), bad).toBeNull()
    }
  })
})
