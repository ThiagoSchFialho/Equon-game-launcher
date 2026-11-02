import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Guards the lint config itself: if a layer rule is removed or broken, these fail.

const eslint = new ESLint({ cache: false })

async function restrictedImports(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
    .filter((m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-globals')
    .map((m) => m.message)
}

const cases: { file: string; code: string; allowed: boolean }[] = [
  { file: 'src/core/domain/x.ts', code: "import 'electron'", allowed: false },
  { file: 'src/core/domain/x.ts', code: "import 'node:fs'", allowed: false },
  { file: 'src/core/domain/x.ts', code: "import 'fs'", allowed: false },
  { file: 'src/core/domain/x.ts', code: "import 'better-sqlite3'", allowed: false },
  { file: 'src/core/domain/x.ts', code: "import '../application'", allowed: false },
  { file: 'src/core/domain/x.ts', code: 'export const f = fetch', allowed: false },
  { file: 'src/core/application/x.ts', code: "import '../../infrastructure'", allowed: false },
  { file: 'src/core/application/x.ts', code: "import 'node:child_process'", allowed: false },
  { file: 'src/core/application/x.ts', code: "import '../domain'", allowed: true },
  { file: 'src/renderer/src/x.ts', code: "import 'electron'", allowed: false },
  { file: 'src/renderer/src/x.ts', code: "import '../../core/domain'", allowed: false },
  { file: 'src/renderer/src/x.ts', code: "import '../../infrastructure'", allowed: false },
  { file: 'src/renderer/src/x.ts', code: "import '../../main/index'", allowed: false },
  { file: 'src/renderer/src/x.ts', code: "import '../../shared/ipc/contract'", allowed: true },
  { file: 'src/preload/x.ts', code: "import 'zod'", allowed: false },
  { file: 'src/preload/x.ts', code: "import '../main/index'", allowed: false },
  { file: 'src/preload/x.ts', code: "import 'electron'", allowed: true },
  { file: 'src/preload/x.ts', code: "import '../shared/ipc/contract'", allowed: true },
  { file: 'src/shared/x.ts', code: "import 'electron'", allowed: false },
  { file: 'src/shared/x.ts', code: "import '../core/domain'", allowed: false },
  { file: 'src/shared/x.ts', code: "import 'zod'", allowed: true },
  { file: 'src/infrastructure/x.ts', code: "import '../main/index'", allowed: false },
  { file: 'src/infrastructure/x.ts', code: "import 'node:fs'", allowed: true },
  { file: 'src/infrastructure/http/x.ts', code: "import 'better-sqlite3'", allowed: false },
  { file: 'src/integrations/steam/x.ts', code: "import 'better-sqlite3'", allowed: false },
  { file: 'src/main/x.ts', code: "import 'better-sqlite3'", allowed: false },
  { file: 'src/main/x.ts', code: "import '../renderer/src/App'", allowed: false },
  { file: 'src/infrastructure/persistence/x.ts', code: "import 'better-sqlite3'", allowed: true },
  { file: 'src/infrastructure/persistence/x.ts', code: "import '../../main/index'", allowed: false }
]

describe('layer boundaries (ESLint)', () => {
  it.each(cases)('$file: $code → allowed=$allowed', async ({ file, code, allowed }) => {
    const messages = await restrictedImports(file, code)
    expect(messages.length === 0).toBe(allowed)
  })
})
