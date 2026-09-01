import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'

// Load the repo-root .env so credential-gated tests can see their variables.
// Without this a gate test silently skips and the suite looks green.
config({ path: new URL('../.env', import.meta.url).pathname })

export default defineConfig({ test: { environment: 'node' } })
