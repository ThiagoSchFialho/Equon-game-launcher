import {
  BuiltinOriginError,
  DuplicateNameError,
  InvalidNameError,
  NotFoundError,
  OriginInUseError,
  type OriginRepository
} from '../../../core/application'
import { normalizeOriginName, originKeyFromName, type Origin } from '../../../core/domain'
import type { SqliteDatabase } from '../database'
import { toBool } from './rows'

interface OriginRow {
  key: string
  name: string
  builtin: number
}

const toOrigin = (row: OriginRow): Origin => ({
  key: row.key,
  name: row.name,
  builtin: toBool(row.builtin)
})

export function createOriginRepository(db: SqliteDatabase): OriginRepository {
  const selectAll = db.prepare<[], OriginRow>(
    'SELECT key, name, builtin FROM origins ORDER BY name COLLATE NOCASE, key'
  )
  const selectByKey = db.prepare<[string], OriginRow>(
    'SELECT key, name, builtin FROM origins WHERE key = ?'
  )
  const nameTaken = db.prepare<[string, string], { key: string }>(
    'SELECT key FROM origins WHERE name = ? AND key <> ?'
  )
  const insert = db.prepare<[string, string], OriginRow>(
    'INSERT INTO origins (key, name) VALUES (?, ?) RETURNING key, name, builtin'
  )
  const updateName = db.prepare<[string, string], OriginRow>(
    'UPDATE origins SET name = ? WHERE key = ? RETURNING key, name, builtin'
  )
  const gameCount = db.prepare<[string], { n: number }>(
    'SELECT count(*) AS n FROM games WHERE origin = ?'
  )
  const remove = db.prepare<[string]>('DELETE FROM origins WHERE key = ?')

  const validName = (name: string, exceptKey = ''): string => {
    const normalized = normalizeOriginName(name)
    if (originKeyFromName(normalized) === null) throw new InvalidNameError(name)
    if (nameTaken.get(normalized, exceptKey)) throw new DuplicateNameError(normalized)
    return normalized
  }

  const uniqueKey = (base: string): string => {
    let key = base
    for (let n = 2; selectByKey.get(key); n++) key = `${base}-${n}`
    return key
  }

  return {
    list: () => selectAll.all().map(toOrigin),

    create: (name) =>
      db.transaction(() => {
        const normalized = validName(name)
        const key = uniqueKey(originKeyFromName(normalized) as string)
        return toOrigin(insert.get(key, normalized) as OriginRow)
      })(),

    rename: (key, name) =>
      db.transaction(() => {
        const normalized = validName(name, key)
        const row = updateName.get(normalized, key)
        if (!row) throw new NotFoundError('Origin', key)
        return toOrigin(row)
      })(),

    delete: (key) =>
      db.transaction(() => {
        const row = selectByKey.get(key)
        if (!row) throw new NotFoundError('Origin', key)
        if (toBool(row.builtin)) throw new BuiltinOriginError(key)
        if ((gameCount.get(key) as { n: number }).n > 0) throw new OriginInUseError(key)
        remove.run(key)
      })()
  }
}
