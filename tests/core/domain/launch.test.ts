import { describe, expect, it } from 'vitest'
import {
  EMULATORS,
  isAllowedExecutableName,
  isAllowedShortcutUrl,
  isRomFor,
  isShortcutName,
  parseInternetShortcut
} from '../../../src/core/domain'

describe('internet shortcuts', () => {
  it('reads the URL of the [InternetShortcut] section', () => {
    const text =
      '[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,0\r\n[InternetShortcut]\r\nIDList=\r\nURL=com.epicgames.launcher://apps/Fortnite?action=launch&silent=true\r\nIconIndex=0\r\n'
    expect(parseInternetShortcut(text)).toBe(
      'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true'
    )
    expect(parseInternetShortcut('[Other]\nURL=steam://x')).toBeNull()
    expect(parseInternetShortcut('[InternetShortcut]\nURL=')).toBeNull()
  })

  it('allows only store schemes', () => {
    for (const url of [
      'steam://rungameid/620',
      'com.epicgames.launcher://apps/x?action=launch',
      'uplay://launch/1',
      'origin2://game/launch?offerIds=1',
      'link2ea://launchgame/1',
      'battlenet://WoW'
    ]) {
      expect(isAllowedShortcutUrl(url), url).toBe(true)
    }
    for (const url of [
      'https://example.com',
      'file:///C:/x.exe',
      'javascript:alert(1)',
      'ms-settings:',
      'not a url'
    ]) {
      expect(isAllowedShortcutUrl(url), url).toBe(false)
    }
  })

  it('recognizes shortcut and Yuzu ROM file names', () => {
    expect(isShortcutName('C:/a/Game.URL')).toBe(true)
    expect(isShortcutName('C:/a/Game.exe')).toBe(false)
    expect(isRomFor(EMULATORS.yuzu, 'D:/z/Zelda.XCI')).toBe(true)
    expect(isRomFor(EMULATORS.yuzu, 'D:/z/Zelda.iso')).toBe(false)
    expect(EMULATORS.yuzu.argumentsFor('D:/z/a b.nsp')).toEqual(['-f', '-g', 'D:/z/a b.nsp'])
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
