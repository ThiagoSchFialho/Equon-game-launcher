/** Errors that repositories and use cases report to callers. */

export class NotFoundError extends Error {
  constructor(entity: string, id: string | number) {
    super(`${entity} ${id} not found`)
  }
}

export class InvalidNameError extends Error {
  constructor(name: string) {
    super(`"${name}" is not a valid name`)
  }
}

export class DuplicateNameError extends Error {
  constructor(name: string) {
    super(`"${name}" already exists`)
  }
}

export class BuiltinOriginError extends Error {
  constructor(key: string) {
    super(`Built-in origin "${key}" cannot be deleted`)
  }
}

export class OriginInUseError extends Error {
  constructor(key: string) {
    super(`Origin "${key}" still has games`)
  }
}

export type LaunchErrorCode =
  | 'not-found'
  | 'no-config'
  | 'not-installed'
  | 'already-running'
  | 'start-failed'
  | 'emulator-missing'
  | 'shortcut-invalid'
  /** Steam did not report the game running in time. */
  | 'start-timeout'
  /** Steam is installing, updating or repairing the game. */
  | 'steam-busy'

export class LaunchError extends Error {
  constructor(
    readonly code: LaunchErrorCode,
    detail?: string
  ) {
    super(detail ? `Launch failed (${code}): ${detail}` : `Launch failed (${code})`)
  }
}

/** A field of a manual game that failed validation. */
export class ManualGameValidationError extends Error {
  constructor(
    readonly field: string,
    readonly code: string
  ) {
    super(`Invalid ${field}: ${code}`)
  }
}
