// Mapping between SQLite rows (0/1 integers, snake_case) and domain types.

export const toBool = (value: number): boolean => value === 1

export const toBit = (value: boolean): 0 | 1 => (value ? 1 : 0)

export const toNullableBool = (value: number | null): boolean | null =>
  value === null ? null : value === 1

export const toNullableBit = (value: boolean | null | undefined): 0 | 1 | null =>
  value === null || value === undefined ? null : toBit(value)
