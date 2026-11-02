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
  default_executable_path: string | null
  default_arguments: string | null
}

const COLUMNS = 'key, name, builtin, default_executable_path, default_arguments'

const toOrigin = (row: OriginRow): Origin => ({
  key: row.key,
  name: row.name,
  builtin: toBool(row.builtin),
  defaultExecutablePath: row.default_executable_path,
  defaultArguments:
    row.default_arguments === null ? null : (JSON.parse(row.default_arguments) as string[])
})

export function createOriginRepository(db: SqliteDatabase): OriginRepository {
  const selectAll = db.prepare<[], OriginRow>(
    `SELECT ${COLUMNS} FROM origins ORDER BY name COLLATE NOCASE, key`
  )
  const selectByKey = db.prepare<[string], OriginRow>(
    `SELECT ${COLUMNS} FROM origins WHERE key = ?`
  )
  const nameTaken = db.prepare<[string, string], { key: string }>(
    'SELECT key FROM origins WHERE name = ? AND key <> ?'
  )
  const insert = db.prepare<[string, string], OriginRow>(
    `INSERT INTO origins (key, name) VALUES (?, ?) RETURNING ${COLUMNS}`
  )
  const updateName = db.prepare<[string, string], OriginRow>(
    `UPDATE origins SET name = ? WHERE key = ? RETURNING ${COLUMNS}`
  )
  const gameCount = db.prepare<[string], { n: number }>(
    'SELECT count(*) AS n FROM games WHERE origin = ?'
  )
  const updateDefaults = db.prepare<[string | null, string | null, string], OriginRow>(
    `UPDATE origins SET default_executable_path = ?, default_arguments = ? WHERE key = ? RETURNING ${COLUMNS}`
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
      })(),

    setDefaults: (key, executablePath, args) => {
      const row = updateDefaults.get(
        executablePath,
        executablePath === null || args === null ? null : JSON.stringify(args),
        key
      )
      if (!row) throw new NotFoundError('Origin', key)
      return toOrigin(row)
    }
  }
}
