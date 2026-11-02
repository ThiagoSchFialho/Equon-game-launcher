import type { EmulatorRepository } from '../../../core/application'
import type { EmulatorConfig, EmulatorKey } from '../../../core/domain'
import type { SqliteDatabase } from '../database'

interface EmulatorRow {
  key: EmulatorKey
  executable_path: string
}

const toConfig = (row: EmulatorRow): EmulatorConfig => ({
  key: row.key,
  executablePath: row.executable_path
})

export function createEmulatorRepository(db: SqliteDatabase): EmulatorRepository {
  const selectAll = db.prepare<[], EmulatorRow>('SELECT * FROM emulators ORDER BY key')
  const selectOne = db.prepare<[string], EmulatorRow>('SELECT * FROM emulators WHERE key = ?')
  const upsert = db.prepare<[string, string], EmulatorRow>(`
    INSERT INTO emulators (key, executable_path) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET executable_path = excluded.executable_path
    RETURNING *`)
  const remove = db.prepare<[string]>('DELETE FROM emulators WHERE key = ?')

  return {
    list: () => selectAll.all().map(toConfig),
    get: (key) => {
      const row = selectOne.get(key)
      return row ? toConfig(row) : null
    },
    set: (key, executablePath) => toConfig(upsert.get(key, executablePath) as EmulatorRow),
    remove: (key) => remove.run(key).changes > 0
  }
}
