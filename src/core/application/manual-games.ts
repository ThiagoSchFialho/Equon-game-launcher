import {
  BuiltinOrigin,
  emulatorForOrigin,
  isAllowedExecutableName,
  isAllowedShortcutUrl,
  isRomFor,
  isShortcutName,
  normalizeName,
  type Game,
  type LaunchConfig
} from '../domain'
import { ManualGameValidationError } from './errors'
import type {
  FileInspector,
  FileState,
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

/** What validation needs from the outside world. */
export interface ManualGameChecks {
  inspector: FileInspector
  originExists: (key: string) => boolean
  /** The URL= target of a .url shortcut, or null. */
  readShortcut: (path: string) => string | null
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

function requireFile(field: string, state: FileState): void {
  if (state === 'missing') fail(field, 'missing')
  if (state === 'directory') fail(field, 'not-file')
  if (state === 'unreadable') fail(field, 'unreadable')
}

/**
 * Validates and normalizes a manual game before saving. Launch paths are
 * untrusted (ARCHITECTURE.md §7):
 * - emulator origins (Yuzu) need an existing ROM of a supported format;
 * - other games need an existing .exe, or a .url shortcut whose target is an
 *   allowlisted store URL (arguments and folder do not apply to shortcuts).
 */
export function validateManualGame(
  input: ManualGameInput,
  checks: ManualGameChecks
): ManualGameInput {
  const title = normalizeName(input.title)
  if (title === '') fail('title', 'required')
  if (title.length > MAX_TITLE) fail('title', 'too-long')

  if (input.origin === BuiltinOrigin.steam || !checks.originExists(input.origin)) {
    fail('origin', 'invalid')
  }

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

  const fields = {
    origin: input.origin,
    title,
    description: optionalText(input.description, 'description'),
    developer: optionalText(input.developer, 'developer'),
    releaseDate,
    requiredAge: input.requiredAge,
    playtimeOffset: input.playtimeOffset
  }

  const emulator = emulatorForOrigin(input.origin)
  if (emulator) {
    const romPath = input.launch.romPath?.trim() ?? ''
    if (romPath === '') fail('romPath', 'required')
    if (!isAbsoluteWindowsPath(romPath)) fail('romPath', 'not-absolute')
    if (!isRomFor(emulator, romPath)) fail('romPath', 'not-rom')
    requireFile('romPath', checks.inspector.stateOf(romPath))
    return {
      ...fields,
      launch: { executablePath: null, romPath, arguments: [], workingDirectory: null }
    }
  }

  const executablePath = input.launch.executablePath?.trim() ?? ''
  if (executablePath === '') fail('executablePath', 'required')
  if (!isAbsoluteWindowsPath(executablePath)) fail('executablePath', 'not-absolute')
  const shortcut = isShortcutName(executablePath)
  if (!shortcut && !isAllowedExecutableName(executablePath)) fail('executablePath', 'not-exe')
  requireFile('executablePath', checks.inspector.stateOf(executablePath))

  if (shortcut) {
    const url = checks.readShortcut(executablePath)
    if (url === null) fail('executablePath', 'shortcut-invalid')
    if (!isAllowedShortcutUrl(url as string)) fail('executablePath', 'shortcut-scheme')
    return {
      ...fields,
      launch: { executablePath, romPath: null, arguments: [], workingDirectory: null }
    }
  }

  const args = input.launch.arguments
  if (args.length > MAX_ARGUMENTS) fail('arguments', 'too-many')
  if (args.some((arg) => arg.includes('\0') || arg.length > MAX_TEXT)) fail('arguments', 'invalid')

  const workingDirectory = input.launch.workingDirectory?.trim() || null
  if (workingDirectory !== null) {
    if (!isAbsoluteWindowsPath(workingDirectory)) fail('workingDirectory', 'not-absolute')
    if (checks.inspector.stateOf(workingDirectory) !== 'directory')
      fail('workingDirectory', 'missing')
  }

  return {
    ...fields,
    launch: { executablePath, romPath: null, arguments: [...args], workingDirectory }
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
    // The file was just checked, so the game is installed.
    deps.games.setInstalled(game.id, true)
    return deps.games.recomputePlayStats(game.id)
  })
}

/**
 * Refreshes `installed` for non-Steam games from the executable, shortcut or
 * ROM (DATA_BASE_CONTEXT.md §3.2): file → 1, missing → 0, unreadable → NULL.
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
    const target = config?.romPath ?? config?.executablePath
    if (!target) continue
    const state = inspector.stateOf(target)
    const installed = state === 'file' ? true : state === 'unreadable' ? null : false
    if (installed !== game.installed) {
      deps.games.setInstalled(game.id, installed)
      changed++
    }
  }
  return changed
}
