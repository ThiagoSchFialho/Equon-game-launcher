import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ArtworkImportFailure,
  detectImageType,
  hasExpectedProportion,
  importArtwork,
  removeGameArtwork
} from '../../src/infrastructure/artwork/import-artwork'
import {
  listDirectory,
  listDrives,
  matchesPickKind
} from '../../src/infrastructure/filesystem/file-browser'
import { createFileInspector } from '../../src/infrastructure/filesystem/file-inspector'
import { createProcessLauncher } from '../../src/infrastructure/process/process-launcher'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'equon-fs-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('process launcher', () => {
  // node.exe stands in for a game executable.
  it('starts without a shell, passes arguments as-is and resolves on exit', async () => {
    const out = join(dir, 'args.json')
    const script = `require('fs').writeFileSync(process.argv[1], JSON.stringify({args: process.argv.slice(2), cwd: process.cwd()}))`
    const child = await createProcessLauncher().launch({
      gameId: 1,
      executablePath: process.execPath,
      arguments: ['-e', script, out, 'a b', '&& echo injected', '"quoted"'],
      workingDirectory: dir
    })
    expect(child.pid).toBeGreaterThan(0)
    await child.exited
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({
      args: ['a b', '&& echo injected', '"quoted"'],
      cwd: dir
    })
  })

  it('rejects when the executable does not exist', async () => {
    await expect(
      createProcessLauncher().launch({
        gameId: 1,
        executablePath: join(dir, 'missing.exe'),
        arguments: [],
        workingDirectory: dir
      })
    ).rejects.toThrow(/ENOENT/)
  })
})

describe('file inspector', () => {
  it('tells files, folders and missing paths apart', () => {
    const file = join(dir, 'game.exe')
    writeFileSync(file, '')
    const inspector = createFileInspector()
    expect(inspector.stateOf(file)).toBe('file')
    expect(inspector.stateOf(dir)).toBe('directory')
    expect(inspector.stateOf(join(dir, 'nope.exe'))).toBe('missing')
    expect(inspector.stateOf(join(file, 'inside.exe'))).toBe('missing')
  })
})

describe('file browser', () => {
  beforeEach(() => {
    mkdirSync(join(dir, 'Games'))
    mkdirSync(join(dir, '$Recycle.Bin'))
    for (const name of ['b.exe', 'A.EXE', 'readme.txt', 'cover.png', 'game.iso', '.hidden.exe']) {
      writeFileSync(join(dir, name), '')
    }
  })

  it('lists folders first, then only the allowed files', () => {
    const listing = listDirectory(dir, 'executable')
    expect(listing.entries.map((e) => e.name)).toEqual(['Games', 'A.EXE', 'b.exe'])
    expect(listing.parent).not.toBeNull()
    expect(listing.truncated).toBe(false)
  })

  it('filters by kind', () => {
    expect(listDirectory(dir, 'image').entries.map((e) => e.name)).toEqual(['Games', 'cover.png'])
    expect(listDirectory(dir, 'directory').entries.map((e) => e.name)).toEqual(['Games'])
    expect(listDirectory(dir, 'rom').entries.map((e) => e.name)).toContain('game.iso')
  })

  it('has no parent at a drive root and lists existing drives', () => {
    expect(listDirectory('C:\\', 'directory').parent).toBeNull()
    expect(listDrives((p) => p === 'C:\\' || p === 'E:\\').map((d) => d.path)).toEqual([
      'C:\\',
      'E:\\'
    ])
  })

  it('matches pick kinds by extension', () => {
    expect(matchesPickKind('C:\\g\\Game.EXE', 'executable')).toBe(true)
    expect(matchesPickKind('C:\\g\\run.bat', 'executable')).toBe(false)
    expect(matchesPickKind('C:\\g\\x.webp', 'image')).toBe(true)
    expect(matchesPickKind('C:\\g\\x.anything', 'rom')).toBe(true)
  })
})

describe('artwork import', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
  type Decode = () => { width: number; height: number } | null
  function decodeAs(width: number, height: number): Decode {
    return () => ({ width, height })
  }
  const failures: [string, Buffer | null, Decode, string][] = [
    ['missing file', null, decodeAs(1920, 1080), 'unreadable'],
    ['fake image', Buffer.from('not an image'), decodeAs(1920, 1080), 'unsupported-type'],
    ['corrupt image', png, () => null, 'undecodable'],
    ['square background', png, decodeAs(1000, 1000), 'wrong-proportion']
  ]

  it('detects the real type from magic bytes', () => {
    expect(detectImageType(png)).toBe('png')
    expect(detectImageType(jpg)).toBe('jpg')
    expect(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp')
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull()
  })

  it('checks proportions per kind with 5% tolerance', () => {
    expect(hasExpectedProportion('background', 1920, 1080)).toBe(true)
    expect(hasExpectedProportion('background', 1920, 1150)).toBe(false)
    expect(hasExpectedProportion('cover_portrait', 600, 900)).toBe(true)
    expect(hasExpectedProportion('logo', 800, 100)).toBe(true)
  })

  it('copies a valid image into the cache, replacing another format of the same kind', () => {
    const source = join(dir, 'bg.png')
    writeFileSync(source, png)
    const cache = join(dir, 'cache')
    mkdirSync(join(cache, '7'), { recursive: true })
    writeFileSync(join(cache, '7', 'background.jpg'), jpg)

    const imported = importArtwork({
      sourcePath: source,
      cacheDir: cache,
      gameId: 7,
      kind: 'background',
      decode: decodeAs(1920, 1080)
    })

    expect(imported).toEqual({ localPath: '7/background.png', width: 1920, height: 1080 })
    expect(readFileSync(join(cache, '7', 'background.png'))).toEqual(png)
    expect(() => readFileSync(join(cache, '7', 'background.jpg'))).toThrow()

    removeGameArtwork(cache, 7)
    expect(() => readFileSync(join(cache, '7', 'background.png'))).toThrow()
  })

  it.each(failures)('rejects a %s', (_label, content, decode, code) => {
    const source = join(dir, 'in.png')
    if (content) writeFileSync(source, content)
    try {
      importArtwork({
        sourcePath: source,
        cacheDir: join(dir, 'cache'),
        gameId: 1,
        kind: 'background',
        decode
      })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ArtworkImportFailure)
      expect((error as ArtworkImportFailure).code).toBe(code)
    }
  })
})
