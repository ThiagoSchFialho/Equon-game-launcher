/** Trims and collapses inner whitespace. Used for user-visible names. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * Key for comparing titles across sources: case, accents, trademark signs and
 * punctuation are ignored ("Pokémon™: Red" and "pokemon red" match).
 */
export function titleMatchKey(title: string): string {
  return (
    title
      // Before NFKD, which would turn "™" into the letters "TM".
      .replace(/[™®©]/g, '')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  )
}
