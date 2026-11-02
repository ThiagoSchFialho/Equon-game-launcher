export const ARTWORK_KINDS = [
  'cover_square',
  'cover_portrait',
  'logo',
  'background',
  'header'
] as const
export type ArtworkKind = (typeof ARTWORK_KINDS)[number]

export const ARTWORK_SOURCES = ['steam', 'steamgriddb', 'user'] as const
export type ArtworkSource = (typeof ARTWORK_SOURCES)[number]
