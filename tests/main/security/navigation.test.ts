import { describe, expect, it } from 'vitest'
import { isAppUrl } from '../../../src/main/security/navigation'

const prod = { rendererFileUrl: 'file:///C:/app/out/renderer/index.html' }
const dev = { ...prod, devServerUrl: 'http://localhost:5173/' }

describe('isAppUrl', () => {
  it('accepts the bundled renderer in production', () => {
    expect(isAppUrl('file:///C:/app/out/renderer/index.html', prod)).toBe(true)
    expect(isAppUrl('file:///C:/app/out/renderer/index.html#/library', prod)).toBe(true)
  })

  it('rejects other local files in production', () => {
    expect(isAppUrl('file:///C:/Windows/win.ini', prod)).toBe(false)
    expect(isAppUrl('file:///C:/app/out/renderer/other.html', prod)).toBe(false)
  })

  it('accepts only the dev server origin in development', () => {
    expect(isAppUrl('http://localhost:5173/src/main.tsx', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isAppUrl('file:///C:/app/out/renderer/index.html', dev)).toBe(false)
  })

  it('rejects remote sites, custom protocols and malformed URLs', () => {
    for (const url of [
      'https://example.com/',
      'steam://rungameid/10',
      'javascript:alert(1)',
      'not a url'
    ]) {
      expect(isAppUrl(url, prod)).toBe(false)
      expect(isAppUrl(url, dev)).toBe(false)
    }
  })
})
