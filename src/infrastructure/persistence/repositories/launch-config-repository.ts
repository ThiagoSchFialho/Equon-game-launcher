import type { LaunchConfigRepository } from '../../../core/application'
import type { LaunchConfig } from '../../../core/domain'
import type { SqliteDatabase } from '../database'

interface LaunchConfigRow {
  game_id: number
  executable_path: string
  arguments: string | null
  working_directory: string | null
}

const toConfig = (row: LaunchConfigRow): LaunchConfig => ({
  gameId: row.game_id,
  executablePath: row.executable_path,
  arguments: row.arguments === null ? [] : (JSON.parse(row.arguments) as string[]),
  workingDirectory: row.working_directory
})

export function createLaunchConfigRepository(db: SqliteDatabase): LaunchConfigRepository {
  const select = db.prepare<[number], LaunchConfigRow>(
    'SELECT * FROM game_launch_configs WHERE game_id = ?'
  )
  const upsert = db.prepare<Record<string, unknown>>(`
    INSERT INTO game_launch_configs (game_id, executable_path, arguments, working_directory)
    VALUES (@gameId, @executablePath, @arguments, @workingDirectory)
    ON CONFLICT (game_id) DO UPDATE SET
      executable_path = excluded.executable_path,
      arguments = excluded.arguments,
      working_directory = excluded.working_directory`)

  return {
    get: (gameId) => {
      const row = select.get(gameId)
      return row ? toConfig(row) : null
    },
    save: (config) => {
      upsert.run({
        gameId: config.gameId,
        executablePath: config.executablePath,
        // No arguments is stored as NULL (DATA_BASE_CONTEXT.md §3.7).
        arguments: config.arguments.length > 0 ? JSON.stringify(config.arguments) : null,
        workingDirectory: config.workingDirectory
      })
    }
  }
}
