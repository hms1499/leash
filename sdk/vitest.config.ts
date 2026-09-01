import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

// Load the repo-root .env so credential-gated tests can see their variables.
// Without this a gate test silently skips and the suite looks green.
//
// Use fileURLToPath rather than new URL(...).pathname: the latter
// percent-encodes special characters (e.g. a space in the repo path becomes
// %20), which points at a path that does not exist and makes dotenv fail
// silently — exactly the looks-green-but-isn't failure this task exists to
// prevent.
const envPath = fileURLToPath(new URL('../.env', import.meta.url))
const result = config({ path: envPath })
if (result.error) {
  // Missing .env is expected/legitimate for unit-only runs (nothing here
  // needs it). Warn loudly rather than fail, so anyone relying on a
  // credential-gated test to actually run can see why it didn't load.
  console.warn(`[vitest.config] no .env loaded from ${envPath}: ${result.error.message}`)
}

export default defineConfig({ test: { environment: 'node' } })
