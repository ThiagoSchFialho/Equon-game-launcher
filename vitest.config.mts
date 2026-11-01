import { defineConfig } from 'vitest/config'

// Run through `npm test` (not vitest directly): `pretest` rebuilds native
// modules such as better-sqlite3 for Node. See README "Native modules".
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
})
