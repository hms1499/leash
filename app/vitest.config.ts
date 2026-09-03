import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // e2e/ holds Playwright specs, which vitest's default *.spec.ts glob
    // would otherwise pick up and try (and fail) to run as unit tests.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
