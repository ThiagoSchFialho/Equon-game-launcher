import { describe, expect, it } from 'vitest'
import { EMULATORS, isBaseGameRom, romGameTitle, sameGameName } from '../../../src/core/domain'

const yuzu = EMULATORS.yuzu

describe('ROMs of the folder', () => {
  it('takes whole games in .nsp and .xci only', () => {
    expect(isBaseGameRom(yuzu, 'Celeste.nsp')).toBe(true)
    expect(isBaseGameRom(yuzu, 'Celeste.XCI')).toBe(true)
    for (const name of ['Celeste.nca', 'Celeste.nro', 'Celeste.nso', 'Celeste.zip', 'notes.txt']) {
      expect(isBaseGameRom(yuzu, name)).toBe(false)
    }
  })

  it('leaves updates and extra content out, by title ID or tag', () => {
    expect(isBaseGameRom(yuzu, 'Zelda BotW [01007EF00011E000][v0].nsp')).toBe(true)
    expect(isBaseGameRom(yuzu, 'Zelda BotW [01007EF00011E800][v786432].nsp')).toBe(false)
    expect(isBaseGameRom(yuzu, 'Zelda BotW [01007EF00011F001][v0].nsp')).toBe(false)
    expect(isBaseGameRom(yuzu, 'Zelda BotW [UPD].nsp')).toBe(false)
    expect(isBaseGameRom(yuzu, 'Zelda BotW (DLC Pack).nsp')).toBe(false)
  })

  it('names the game from its file', () => {
    expect(romGameTitle('The Legend of Zelda Breath of the Wild [01007EF00011E000][v0].nsp')).toBe(
      'The Legend of Zelda Breath of the Wild'
    )
    expect(romGameTitle('Super_Mario_Odyssey (USA) (En,Fr).xci')).toBe('Super Mario Odyssey')
    expect(romGameTitle('Hades - [0100535012974000].nsp')).toBe('Hades')
    expect(romGameTitle('[0100535012974000].nsp')).toBe('')
  })

  it('puts back in front an article the ROM set moved to the end', () => {
    expect(
      romGameTitle("Legend of Zelda, The - Link's Awakening (World) (En,Ja) (Rev 1).xci")
    ).toBe("The Legend of Zelda - Link's Awakening")
    expect(romGameTitle('Witcher 3, The.nsp')).toBe('The Witcher 3')
    // Only a whole article before a subtitle or the end.
    expect(romGameTitle('Hello, Theodore.nsp')).toBe('Hello, Theodore')
    expect(romGameTitle('Paper Mario - The Thousand-Year Door.nsp')).toBe(
      'Paper Mario - The Thousand-Year Door'
    )
  })

  it('compares names as people read them', () => {
    expect(
      sameGameName(
        'The Legend of Zelda: Breath of the Wild',
        'The Legend of Zelda Breath of the Wild'
      )
    ).toBe(true)
    expect(sameGameName('Pokémon™ Sword', 'pokemon sword')).toBe(true)
    expect(
      sameGameName(
        "The Legend of Zelda: Link's Awakening",
        "The Legend of Zelda - Link's Awakening"
      )
    ).toBe(true)
    expect(sameGameName('Hades', 'Hades II')).toBe(false)
    expect(sameGameName('', '')).toBe(false)
  })
})
