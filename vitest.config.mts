import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Node environment by default; renderer tests opt into jsdom with a
// `// @vitest-environment jsdom` comment at the top of the file.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}']
  }
})
