/** ISO-8601 UTC with second precision, the single timestamp format in the database. */
export function toUtcIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
