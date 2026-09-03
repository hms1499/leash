import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // The dashboard reads mainnet over forno, which is not fast.
  timeout: 60_000,
  use: { baseURL: process.env.LEASH_E2E_URL ?? 'http://localhost:3000' },
  webServer: process.env.LEASH_E2E_URL
    ? undefined
    : { command: 'pnpm run build && pnpm run start', url: 'http://localhost:3000', timeout: 120_000 },
})
