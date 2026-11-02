import { builtinModules } from 'node:module'
import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

// Layer boundaries from ARCHITECTURE.md §6 and §3.15. Each block lists every
// restriction for its folder because flat config replaces (not merges) a rule.

const nodeBuiltins = builtinModules.flatMap((name) => [name, `node:${name}`])
const privilegedPackages = [
  'electron',
  'better-sqlite3',
  'undici',
  'axios',
  'node-fetch',
  'got',
  'ky',
  'ws'
]

const sqlOnlyInPersistence = 'SQL lives only in src/infrastructure/persistence.'

const forbid = (names, message) => names.map((name) => ({ name, message }))
const forbidLayers = (layers, message) => ({
  regex: `(^|/)(${layers.join('|')})(/|$)`,
  message
})

const noPrivilegedImports = (message) => [
  ...forbid(nodeBuiltins, message),
  ...forbid(privilegedPackages, message)
]

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: noPrivilegedImports('core must stay pure: no Electron, Node I/O, network or SQL.'),
          patterns: [
            forbidLayers(
              ['main', 'preload', 'renderer', 'infrastructure', 'integrations'],
              'core must not depend on outer layers; define a port instead.'
            )
          ]
        }
      ],
      'no-restricted-globals': [
        'error',
        ...['process', 'require', 'Buffer', '__dirname', '__filename'].map((name) => ({
          name,
          message: 'core must not use Node globals.'
        })),
        ...['fetch', 'XMLHttpRequest', 'WebSocket'].map((name) => ({
          name,
          message: 'core must not do network I/O; use a port.'
        }))
      ]
    }
  },
  {
    files: ['src/core/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: noPrivilegedImports('core must stay pure: no Electron, Node I/O, network or SQL.'),
          patterns: [
            forbidLayers(
              ['main', 'preload', 'renderer', 'infrastructure', 'integrations', 'application'],
              'domain must not depend on application or outer layers.'
            )
          ]
        }
      ]
    }
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: noPrivilegedImports('shared is loaded by every process; keep it runtime-neutral.'),
          patterns: [
            forbidLayers(
              ['main', 'preload', 'renderer', 'core', 'infrastructure', 'integrations'],
              'shared must not depend on other layers.'
            )
          ]
        }
      ]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...noPrivilegedImports('renderer has no Node access; use the preload API.'),
            {
              name: '@electron-toolkit/preload',
              message: 'renderer talks to main only through window.equon.'
            }
          ],
          patterns: [
            forbidLayers(
              ['main', 'preload', 'core', 'infrastructure', 'integrations'],
              'renderer may import only shared; use the preload API for everything else.'
            )
          ]
        }
      ]
    }
  },
  {
    files: ['src/preload/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Sandboxed preload can only load 'electron'; everything else must be bundled from shared.
              regex: '^(?!electron$|[.]{1,2}/)',
              message: 'preload may import only electron and shared.'
            },
            forbidLayers(
              ['main', 'renderer', 'core', 'infrastructure', 'integrations'],
              'preload may import only electron and shared.'
            )
          ]
        }
      ]
    }
  },
  {
    files: ['src/infrastructure/**/*.{ts,tsx}', 'src/integrations/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'better-sqlite3', message: sqlOnlyInPersistence }],
          patterns: [
            forbidLayers(
              ['main', 'preload', 'renderer'],
              'adapters implement core ports; only main wires them together.'
            )
          ]
        }
      ]
    }
  },
  {
    // The only place allowed to talk to SQLite (DATA_BASE_CONTEXT.md §1).
    files: ['src/infrastructure/persistence/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            forbidLayers(
              ['main', 'preload', 'renderer'],
              'adapters implement core ports; only main wires them together.'
            )
          ]
        }
      ]
    }
  },
  {
    files: ['src/main/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'better-sqlite3', message: sqlOnlyInPersistence }],
          patterns: [forbidLayers(['renderer'], 'main must not import renderer code.')]
        }
      ]
    }
  },
  eslintConfigPrettier
)
