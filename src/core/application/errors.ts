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
