/** Trims and collapses inner whitespace. Used for user-visible names. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}
