import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  /**
   * `@leash/sdk` is a workspace package. It does not exist on the registry
   * under that name -- and worse, `@leash/sdk` on npm is an unrelated
   * project -- so leaving it external would make `npm install` fetch a
   * stranger's code. It must be inlined.
   *
   * Everything else stays a real dependency: the bundle stays small, and a
   * security patch in viem reaches users through ordinary resolution rather
   * than waiting for a republish here.
   */
  noExternal: ['@leash/sdk'],
  /**
   * A published bin is one file. Without this, tsup's default ESM code
   * splitting factors the inlined `@leash/sdk` module into its own chunk and
   * reaches it from `index.js` via a runtime `import("./chunk.js")` -- which
   * is a weaker form of the exact hazard `noExternal` above exists to avoid:
   * a dependency the resolver has to satisfy at run time instead of one
   * inlined at build time.
   */
  splitting: false,
  /**
   * The shebang lives here rather than in the source. The source shebang was
   * `#!/usr/bin/env -S npx tsx`, which fetched tsx over the network on every
   * server start; the published bin is plain JavaScript and must say so.
   */
  banner: { js: '#!/usr/bin/env node' },
})
