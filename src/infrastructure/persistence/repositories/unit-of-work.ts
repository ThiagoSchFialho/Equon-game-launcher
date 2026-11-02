import type { UnitOfWork } from '../../../core/application'
import type { SqliteDatabase } from '../database'

export function createUnitOfWork(db: SqliteDatabase): UnitOfWork {
  return {
    transaction: (fn) => db.transaction(fn)()
  }
}
