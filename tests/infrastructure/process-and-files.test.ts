import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ArtworkImportFailure,
  detectImageType,
  hasExpectedProportion,
  importArtwork,
  removeGameArtwork,
  webpSize
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
    for (const name of [
      'b.exe',
      'A.EXE',
      'readme.txt',
      'cover.png',
      'game.iso',
      'zelda.nsp',
      'Epic.url',
      '.hidden.exe'
    ]) {
      writeFileSync(join(dir, name), '')
    }
  })

  it('lists folders first, then only the allowed files', () => {
    const listing = listDirectory(dir, 'executable')
    expect(listing.entries.map((e) => e.name)).toEqual(['Games', 'A.EXE', 'b.exe', 'Epic.url'])
    expect(listing.parent).not.toBeNull()
    expect(listing.truncated).toBe(false)
  })

  it('filters by kind', () => {
    expect(listDirectory(dir, 'image').entries.map((e) => e.name)).toEqual(['Games', 'cover.png'])
    expect(listDirectory(dir, 'directory').entries.map((e) => e.name)).toEqual(['Games'])
    expect(listDirectory(dir, 'rom').entries.map((e) => e.name)).toEqual(['Games', 'zelda.nsp'])
    expect(listDirectory(dir, 'emulator').entries.map((e) => e.name)).toEqual([
      'Games',
      'A.EXE',
      'b.exe'
    ])
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
    expect(matchesPickKind('C:\\g\\x.url', 'executable')).toBe(true)
    expect(matchesPickKind('C:\\g\\x.url', 'emulator')).toBe(false)
    expect(matchesPickKind('C:\\g\\x.XCI', 'rom')).toBe(true)
    expect(matchesPickKind('C:\\g\\x.iso', 'rom')).toBe(false)
    for (const file of ['g.exe', 'g.url', 'g.nsp']) {
      expect(matchesPickKind(`C:\\g\\${file}`, 'game')).toBe(true)
    }
    expect(matchesPickKind('C:\\g\\g.iso', 'game')).toBe(false)
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
    // IGDB covers are 3:4; square images are still not portrait covers.
    expect(hasExpectedProportion('cover_portrait', 810, 1080)).toBe(true)
    expect(hasExpectedProportion('cover_portrait', 600, 600)).toBe(false)
    expect(hasExpectedProportion('cover_portrait', 500, 900)).toBe(false)
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

describe('webpSize', () => {
  const riff = (chunk: string, body: number[]): Uint8Array => {
    const bytes = new Uint8Array(40)
    bytes.set(
      [...'RIFF'].map((c) => c.charCodeAt(0)),
      0
    )
    bytes.set(
      [...'WEBP'].map((c) => c.charCodeAt(0)),
      8
    )
    bytes.set(
      [...chunk].map((c) => c.charCodeAt(0)),
      12
    )
    bytes.set(body, 20)
    return bytes
  }

  it('reads VP8X, VP8 and VP8L headers (as served by the Steam store)', () => {
    // VP8X: 24-bit width-1 and height-1 at bytes 24 and 27 → 1438×808.
    expect(webpSize(riff('VP8X', [0, 0, 0, 0, 0x9d, 0x05, 0, 0x27, 0x03, 0]))).toEqual({
      width: 1438,
      height: 808
    })
    expect(webpSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x9e, 0x05, 0x28, 0x03]))).toEqual({
      width: 1438,
      height: 808
    })
    // VP8L: signature 0x2f, then 14-bit width-1 and height-1.
    const bits = (1437 & 0x3fff) | ((807 & 0x3fff) << 14)
    expect(
      webpSize(
        riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, bits >>> 24])
      )
    ).toEqual({ width: 1438, height: 808 })
  })

  it('rejects other formats and broken headers', () => {
    expect(webpSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull()
    expect(webpSize(riff('VP8 ', [0, 0, 0, 0, 0, 0]))).toBeNull()
    expect(webpSize(riff('ABCD', []))).toBeNull()
  })
})
