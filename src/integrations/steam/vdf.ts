/**
 * Minimal parser for Valve's text KeyValues ("VDF") format used by
 * libraryfolders.vdf and appmanifest_*.acf: quoted keys, quoted values or
 * nested blocks, `//` comments and backslash escapes. Keys keep their case;
 * a repeated key keeps the last value.
 */
export interface VdfObject {
  [key: string]: string | VdfObject
}

export class VdfParseError extends Error {}

export function parseVdf(text: string): VdfObject {
  let i = 0

  const skip = (): void => {
    while (i < text.length) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') i++
      else if (c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++
      } else break
    }
  }

  const readString = (): string => {
    if (text[i] !== '"') throw new VdfParseError(`Expected '"' at ${i}`)
    i++
    let out = ''
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < text.length) {
        const next = text[i + 1]
        out += next === 'n' ? '\n' : next === 't' ? '\t' : next
        i += 2
      } else {
        out += text[i++]
      }
    }
    if (i >= text.length) throw new VdfParseError('Unterminated string')
    i++
    return out
  }

  const readBlock = (nested: boolean): VdfObject => {
    const object: VdfObject = {}
    for (;;) {
      skip()
      if (i >= text.length) {
        if (nested) throw new VdfParseError('Unterminated block')
        return object
      }
      if (text[i] === '}') {
        if (!nested) throw new VdfParseError(`Unexpected '}' at ${i}`)
        i++
        return object
      }
      const key = readString()
      skip()
      if (text[i] === '{') {
        i++
        object[key] = readBlock(true)
      } else {
        object[key] = readString()
      }
    }
  }

  return readBlock(false)
}

/** Case-insensitive child lookup (Valve files are not consistent about case). */
export function vdfGet(object: VdfObject, key: string): string | VdfObject | undefined {
  const lower = key.toLowerCase()
  for (const [k, v] of Object.entries(object)) if (k.toLowerCase() === lower) return v
  return undefined
}
