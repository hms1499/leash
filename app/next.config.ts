import type { NextConfig } from 'next'

// @leash/sdk ships raw TypeScript (its package main is src/index.ts), so Next
// has to compile it rather than treat it as a built dependency.
const config: NextConfig = {
  transpilePackages: ['@leash/sdk'],
  webpack(config) {
    // Local imports use the TS5 "bundler" convention of a .js specifier
    // pointing at a .ts file (e.g. `from '../lib/chain.js'`). tsc and vitest
    // resolve that natively; webpack needs this alias or it 404s on the
    // literal .js file.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    }
    return config
  },
}

export default config
