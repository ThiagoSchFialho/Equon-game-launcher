import type { EmulatorRepository } from '../../../core/application'
import type { EmulatorConfig, EmulatorKey } from '../../../core/domain'
import type { SqliteDatabase } from '../database'

interface EmulatorRow {
  key: EmulatorKey
  executable_path: string
  rom_directory: string | null
}

const toConfig = (row: EmulatorRow): EmulatorConfig => ({
  key: row.key,
  executablePath: row.executable_path,
  romDirectory: row.rom_directory
})

export function createEmulatorRepository(db: SqliteDatabase): EmulatorRepository {
  const selectAll = db.prepare<[], EmulatorRow>('SELECT * FROM emulators ORDER BY key')
  const selectOne = db.prepare<[string], EmulatorRow>('SELECT * FROM emulators WHERE key = ?')
  // Changing the executable keeps the ROM folder.
  const upsert = db.prepare<[string, string], EmulatorRow>(`
    INSERT INTO emulators (key, executable_path) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET executable_path = excluded.executable_path
    RETURNING *`)
  const updateRomDirectory = db.prepare<[string | null, string], EmulatorRow>(
    'UPDATE emulators SET rom_directory = ? WHERE key = ? RETURNING *'
  )
  const remove = db.prepare<[string]>('DELETE FROM emulators WHERE key = ?')

  return {
    list: () => selectAll.all().map(toConfig),
    get: (key) => {
      const row = selectOne.get(key)
      return row ? toConfig(row) : null
    },
    set: (key, executablePath) => toConfig(upsert.get(key, executablePath) as EmulatorRow),
    setRomDirectory: (key, romDirectory) => {
      const row = updateRomDirectory.get(romDirectory, key)
      return row ? toConfig(row) : null
    },
    remove: (key) => remove.run(key).changes > 0
  }
}
