import {
  BuiltinOrigin,
  isAllowedExecutableName,
  normalizeName,
  type Game,
  type LaunchConfig
} from '../domain'
import { ManualGameValidationError } from './errors'
import type {
  FileInspector,
  GameRepository,
  LaunchConfigRepository,
  ManualGameFields,
  UnitOfWork
} from './ports'

/** Age ratings the form offers (DESIGN_SYSTEM.md §10); null = not informed. */
export const REQUIRED_AGES = ['L', '10', '12', '14', '16', '18'] as const

export interface ManualGameInput extends ManualGameFields {
  launch: Omit<LaunchConfig, 'gameId'>
}

const MAX_TEXT = 4000
const MAX_TITLE = 200
const MAX_ARGUMENTS = 64
const MAX_OFFSET_MINUTES = 10_000_000

const fail = (field: string, code: string): never => {
  throw new ManualGameValidationError(field, code)
}

/** Windows absolute path: drive letter or UNC share. */
export function isAbsoluteWindowsPath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(path)
}

function optionalText(value: string | null, field: string): string | null {
  const text = value?.trim() ?? ''
  if (text.length > MAX_TEXT) fail(field, 'too-long')
  return text === '' ? null : text
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/**
 * Validates and normalizes a manual game before saving. Launch paths are
 * untrusted (ARCHITECTURE.md §7): the executable must be an existing .exe
 * file and the working directory, if any, an existing folder.
 */
export function validateManualGame(
  input: ManualGameInput,
  inspector: FileInspector,
  originExists: (key: string) => boolean
): ManualGameInput {
  const title = normalizeName(input.title)
  if (title === '') fail('title', 'required')
  if (title.length > MAX_TITLE) fail('title', 'too-long')

  if (input.origin === BuiltinOrigin.steam || !originExists(input.origin)) fail('origin', 'invalid')

  const releaseDate = input.releaseDate?.trim() || null
  if (releaseDate !== null && !isValidIsoDate(releaseDate)) fail('releaseDate', 'invalid')

  if (
    input.requiredAge !== null &&
    !(REQUIRED_AGES as readonly string[]).includes(input.requiredAge)
  ) {
    fail('requiredAge', 'invalid')
  }

  if (
    !Number.isInteger(input.playtimeOffset) ||
    input.playtimeOffset < 0 ||
    input.playtimeOffset > MAX_OFFSET_MINUTES
  ) {
    fail('playtimeOffset', 'invalid')
  }

  const executablePath = input.launch.executablePath.trim()
  if (!isAbsoluteWindowsPath(executablePath)) fail('executablePath', 'not-absolute')
  if (!isAllowedExecutableName(executablePath)) fail('executablePath', 'not-exe')
  const exeState = inspector.stateOf(executablePath)
  if (exeState === 'missing') fail('executablePath', 'missing')
  if (exeState === 'directory') fail('executablePath', 'not-file')
  if (exeState === 'unreadable') fail('executablePath', 'unreadable')

  const args = input.launch.arguments
  if (args.length > MAX_ARGUMENTS) fail('arguments', 'too-many')
  if (args.some((arg) => arg.includes('\0') || arg.length > MAX_TEXT)) fail('arguments', 'invalid')

  const workingDirectory = input.launch.workingDirectory?.trim() || null
  if (workingDirectory !== null) {
    if (!isAbsoluteWindowsPath(workingDirectory)) fail('workingDirectory', 'not-absolute')
    if (inspector.stateOf(workingDirectory) !== 'directory') fail('workingDirectory', 'missing')
  }

  return {
    origin: input.origin,
    title,
    description: optionalText(input.description, 'description'),
    developer: optionalText(input.developer, 'developer'),
    releaseDate,
    requiredAge: input.requiredAge,
    playtimeOffset: input.playtimeOffset,
    launch: { executablePath, arguments: [...args], workingDirectory }
  }
}

export interface ManualGameDeps {
  games: GameRepository
  configs: LaunchConfigRepository
  uow: UnitOfWork
}

/** Creates (no id) or updates a manual game and its launch configuration in one transaction. */
export function saveManualGame(deps: ManualGameDeps, input: ManualGameInput, id?: number): Game {
  const { launch, ...fields } = input
  return deps.uow.transaction(() => {
    const game = id === undefined ? deps.games.create(fields) : deps.games.updateManual(id, fields)
    deps.configs.save({ gameId: game.id, ...launch })
    // The executable was just checked, so the game is installed.
    deps.games.setInstalled(game.id, true)
    return deps.games.recomputePlayStats(game.id)
  })
}

/**
 * Refreshes `installed` for non-Steam games from their executable
 * (DATA_BASE_CONTEXT.md §3.2): file → 1, missing → 0, unreadable → NULL.
 * A failed read never writes 0. Returns how many games changed.
 */
export function refreshManualInstallStates(
  deps: Pick<ManualGameDeps, 'games' | 'configs'>,
  inspector: FileInspector
): number {
  let changed = 0
  for (const game of deps.games.list()) {
    if (game.origin === BuiltinOrigin.steam) continue
    const config = deps.configs.get(game.id)
    if (!config) continue
    const state = inspector.stateOf(config.executablePath)
    const installed = state === 'file' ? true : state === 'unreadable' ? null : false
    if (installed !== game.installed) {
      deps.games.setInstalled(game.id, installed)
      changed++
    }
  }
  return changed
}
