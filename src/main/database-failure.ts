import { dirname } from 'node:path'

const RECOVERY = (folder: string): string =>
  `Nada foi apagado. Seus dados e cópias de segurança (equon.sqlite.v*.bak) estão em:\n${folder}`

/**
 * What the user reads when the database cannot be opened. The launcher cannot
 * work without it, so this must say what happened and that the data is safe.
 */
export function describeDatabaseFailure(error: unknown, filename: string): string {
  const code = (error as { code?: unknown } | null)?.code
  const message = error instanceof Error ? error.message : String(error)
  const folder = dirname(filename)
  let what = 'Não foi possível abrir o banco de dados do Equon.'
  if (/newer than this app supports/.test(message)) {
    what = 'Estes dados foram criados por uma versão mais nova do Equon. Atualize o Equon.'
  } else if (code === 'SQLITE_NOTADB' || code === 'SQLITE_CORRUPT') {
    what = 'O arquivo do banco de dados do Equon está danificado.'
  } else if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
    what = 'O banco de dados do Equon está em uso por outro programa.'
  } else if (code === 'SQLITE_CANTOPEN' || code === 'SQLITE_READONLY' || code === 'EACCES') {
    what = 'O Equon não tem permissão para usar a pasta de dados.'
  } else if (code === 'SQLITE_FULL') {
    what = 'Não há espaço em disco para abrir o banco de dados do Equon.'
  }
  return `${what}\n\n${RECOVERY(folder)}\n\nDetalhe: ${message}`
}
