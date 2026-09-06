# Leash npm Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the Leash MCP server to npm as `leash-agentpay` so a stranger installs it with `npx -y leash-agentpay` instead of cloning the repository and hand-editing an absolute path.

**Architecture:** One published package. The `@leash/sdk` workspace package is inlined into the bundle (it cannot resolve from the registry); `viem`, `@modelcontextprotocol/sdk` and `@celo/attribution-tags` stay real dependencies. `tsup` emits a single ESM bundle with a `#!/usr/bin/env node` shebang, so `tsx` leaves the runtime entirely. The app's `.mcp.json` builder then emits `npx -y leash-agentpay` in place of the absolute path.

**Tech Stack:** TypeScript, tsup (esbuild), vitest, pnpm 9.12.0 workspaces, GitHub Actions, npm registry.

**Spec:** `docs/superpowers/specs/2026-09-06-leash-npm-distribution-design.md`

## Global Constraints

- Node >= 20. pnpm 9.12.0 (pinned in the root `package.json` `packageManager` field).
- Published package name is exactly **`leash-agentpay`** (verified free on the registry 2026-09-06). Bin name is also `leash-agentpay`.
- The SDK is **not** published. It is bundled into the server. Do not add a publish step for it.
- No ESLint/Prettier/Biome config exists. Match the style of surrounding code.
- Comments explain *why*, especially where a line guards a hazard that was paid for. Do not strip such comments when editing nearby code.
- Commit subjects describe the defect or the change in plain English, not the diff. Bodies explain reasoning and cite evidence.
- `scripts/check-secrets.sh` runs pre-commit and **blocks any 64-hex value on a line matching `KEY|PK|PRIVATE|SECRET|MNEMONIC|SEED`**. Test fixtures must therefore *construct* fake keys at runtime (`'0x' + '11'.repeat(32)`), never write one as a literal.
- `test:gate` in `sdk` and `mcp` spends real money on mainnet. Never run it.
- Never claim a step passed without running it and reading the output.

---

### Task 1: Build the publishable package

Turns `@leash/mcp` (a private workspace package whose `main` is raw TypeScript) into `leash-agentpay` (a bundled, publishable ESM package with a working bin).

**Files:**
- Create: `mcp/tsup.config.ts`
- Modify: `mcp/package.json` (whole file)
- Modify: `mcp/src/index.ts:1` (the shebang line)
- Modify: `CLAUDE.md`, `README.md`, `docs/RESUME.md` (the `pnpm -F @leash/mcp` filter)

**Interfaces:**
- Consumes: nothing.
- Produces: `mcp/dist/index.js` — a single ESM bundle, executable, with `@leash/sdk` inlined. Task 2 packs and runs it. Task 4 emits its bin name into `.mcp.json`.

- [ ] **Step 1: Add tsup**

```bash
pnpm -F @leash/mcp add -D tsup@^8.3.0
```

- [ ] **Step 2: Write the bundler config**

Create `mcp/tsup.config.ts`:

```ts
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
   * The shebang lives here rather than in the source. The source shebang was
   * `#!/usr/bin/env -S npx tsx`, which fetched tsx over the network on every
   * server start; the published bin is plain JavaScript and must say so.
   */
  banner: { js: '#!/usr/bin/env node' },
})
```

- [ ] **Step 3: Remove the source shebang**

`mcp/src/index.ts` line 1 currently reads `#!/usr/bin/env -S npx tsx`. Delete that line entirely — tsup's banner supplies the replacement, and `tsx` ignores shebangs when running source directly, so `pnpm -F leash-agentpay start` is unaffected.

- [ ] **Step 4: Rewrite the package manifest**

Replace `mcp/package.json` with:

```json
{
  "name": "leash-agentpay",
  "version": "0.1.0",
  "type": "module",
  "description": "Give an AI agent a wallet on Celo with spend limits enforced on-chain. MCP server.",
  "license": "MIT",
  "keywords": ["mcp", "celo", "agent", "wallet", "x402", "stablecoin", "spend-limit"],
  "homepage": "https://github.com/hms1499/leash#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/hms1499/leash.git",
    "directory": "mcp"
  },
  "bin": { "leash-agentpay": "./dist/index.js" },
  "files": ["dist"],
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsup",
    "test": "vitest run --exclude '**/*.gate.test.ts' --exclude '**/bundle.test.ts'",
    "test:bundle": "vitest run bundle",
    "test:gate": "vitest run mainnet.gate",
    "start": "tsx src/index.ts",
    "prepublishOnly": "pnpm run build"
  },
  "dependencies": {
    "@celo/attribution-tags": "0.3.0",
    "@modelcontextprotocol/sdk": "^1.30.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@leash/sdk": "workspace:*",
    "@types/node": "^22.0.0",
    "tsup": "^8.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Three changes carry real weight and must not be undone:

1. **`"private": true` is gone.** Without this the package cannot publish.
2. **`@leash/sdk` moved to `devDependencies`.** It is bundled in, so it must not be requested at install time. Leaving it in `dependencies` would make every user's `npm install` fetch `@leash/sdk@0.4.4` — an unrelated authentication library owned by someone else.
3. **`@celo/attribution-tags` moved *into* `dependencies`.** It was the SDK's dependency; inlining the SDK means adopting its runtime dependencies here.

- [ ] **Step 5: Build and inspect the output**

```bash
cd /Users/vanhuy/Desktop/celo && pnpm -F leash-agentpay build
head -c 60 mcp/dist/index.js
grep -c "@leash/sdk" mcp/dist/index.js || echo "0 references — SDK inlined"
```

Expected: the first line is `#!/usr/bin/env node`, and `@leash/sdk` appears **zero** times in the bundle. Any occurrence means `noExternal` did not take and the published bin will fail to resolve.

- [ ] **Step 6: Confirm the existing suite still passes**

```bash
cd /Users/vanhuy/Desktop/celo && pnpm -F leash-agentpay test
```

Expected: 20 passed.

- [ ] **Step 7: Sweep the workspace filter out of the docs**

`pnpm -F @leash/mcp test` no longer resolves. Replace it with `pnpm -F leash-agentpay test` in `CLAUDE.md`, `README.md` (the Development table), and `docs/RESUME.md` (the suite table). Historical files under `docs/superpowers/plans/` and `docs/superpowers/specs/` are records of decisions already taken — do not edit them.

```bash
cd /Users/vanhuy/Desktop/celo && grep -rn "@leash/mcp" CLAUDE.md README.md docs/RESUME.md
```

Expected after the edit: no matches.

- [ ] **Step 8: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add mcp/package.json mcp/tsup.config.ts mcp/src/index.ts CLAUDE.md README.md docs/RESUME.md pnpm-lock.yaml
git commit -m "$(cat <<'MSG'
feat(mcp): the server was source-only and could not be installed by anyone

`@leash/mcp` was `"private": true`, its `main` pointed at raw TypeScript, and
its shebang fetched tsx over the network on every start. The only way to run it
was to clone the repository.

It builds to a single ESM bundle now, published as `leash-agentpay`.
`@leash/sdk` is inlined because it is a workspace package -- and because
`@leash/sdk` on the registry is an unrelated project, so leaving it external
would have made every user's install fetch a stranger's code. It moves to
devDependencies for the same reason, and `@celo/attribution-tags` moves in,
since inlining the SDK means adopting its runtime dependencies.

MSG
)"
```

---

### Task 2: Prove the bundle actually runs, including `leash_fetch`

The spec's named hazard. `mcp/src/index.ts:93` imports the SDK **dynamically**, inside the `leash_fetch` branch only. A bundle that leaves it external leaves `leash_status` and `leash_pay` working perfectly and breaks `leash_fetch` at runtime, on a user's machine, in a path no test in this repository covers.

This task turns that check into a committed test so it runs again on every change.

**Files:**
- Create: `mcp/test/bundle.test.ts`

**Interfaces:**
- Consumes: `mcp/dist/index.js` from Task 1, and the `build` / `test:bundle` scripts.
- Produces: `pnpm -F leash-agentpay test:bundle` — the command Task 5's CI job runs.

- [ ] **Step 1: Write the failing test**

Create `mcp/test/bundle.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

/**
 * These run against the PACKED TARBALL, not against src/. That is the whole
 * point: every other suite here imports TypeScript through vitest, which
 * resolves `@leash/sdk` via the workspace symlink and so can never observe
 * the failure this file exists to catch.
 */
// `__dirname` does not exist here: this package is "type": "module".
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const mcpDir = join(repoRoot, 'mcp')
let installDir: string
let binPath: string

/**
 * A fake key, built at runtime rather than written down. `check-secrets.sh`
 * blocks any 64-hex value on a line mentioning PK, and a literal here would
 * make every commit touching this file need --no-verify.
 */
const FAKE_PK = ('0x' + '11'.repeat(32)) as `0x${string}`

const ENV = {
  LEASH_ACCOUNT: '0x7aDa926B021BAef4896F51F237bCA61435E43fd2',
  OPERATOR_PK: FAKE_PK,
  ATTRIBUTION_TAG: 'celo_3dec652cd977',
  SPEND_TOKEN: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  FEE_ADAPTER: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
}

let stub: Server
let stubUrl: string

beforeAll(async () => {
  execFileSync('pnpm', ['run', 'build'], { cwd: mcpDir, stdio: 'inherit' })
  // `--json` rather than scraping stdout: `npm pack --silent` suppresses the
  // very filename this line needs, and the plain form interleaves it with logs.
  const packed = JSON.parse(
    execFileSync('npm', ['pack', '--json'], { cwd: mcpDir }).toString(),
  )[0].filename as string
  installDir = mkdtempSync(join(tmpdir(), 'leash-bundle-'))
  execFileSync('npm', ['install', '--silent', join(mcpDir, packed)], { cwd: installDir })
  binPath = join(installDir, 'node_modules', 'leash-agentpay', 'dist', 'index.js')
  rmSync(join(mcpDir, packed))

  // A 402 challenge in the exact shape parseChallenge demands: scheme
  // "exact", network "celo", and an `extra` carrying the token's EIP-712
  // domain, which is published nowhere else.
  stub = createServer((_req, res) => {
    res.writeHead(402, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      x402Version: 1,
      accepts: [{
        scheme: 'exact',
        network: 'celo',
        maxAmountRequired: '10000',
        resource: 'http://stub.local/thing',
        payTo: '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57',
        asset: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
        maxTimeoutSeconds: 60,
        description: 'a stub resource',
        extra: { name: 'USDC', version: '2' },
      }],
    }))
  })
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r))
  stubUrl = `http://127.0.0.1:${(stub.address() as { port: number }).port}/thing`
}, 180_000)

afterAll(() => {
  stub?.close()
  if (installDir) rmSync(installDir, { recursive: true, force: true })
})

describe('the packed bundle', () => {
  it('ships a bin at the path package.json advertises', () => {
    expect(existsSync(binPath)).toBe(true)
  })

  it('fails loudly on missing configuration rather than on a missing module', () => {
    let output = ''
    try {
      execFileSync('node', [binPath], { env: { PATH: process.env.PATH }, stdio: 'pipe' })
    } catch (e) {
      output = String((e as { stderr?: Buffer }).stderr ?? '')
    }
    expect(output).toContain('OPERATOR_PK is not set')
    // The failure that would mean the bundle is broken, spelled out so a
    // regression names itself instead of looking like a config problem.
    expect(output).not.toMatch(/Cannot find package|ERR_MODULE_NOT_FOUND/)
  })

  /**
   * The hazard. `leash_fetch` is the only caller of the dynamic
   * `await import('@leash/sdk')`, so it is the only tool that can fail while
   * the other two pass. quote_only touches no chain and spends nothing.
   */
  it('serves leash_fetch, whose SDK import is dynamic and easily left external', async () => {
    const client = new Client({ name: 'bundle-test', version: '0' }, { capabilities: {} })
    await client.connect(new StdioClientTransport({
      command: 'node', args: [binPath], env: { PATH: process.env.PATH!, ...ENV },
    }))
    try {
      const res = await client.callTool({
        name: 'leash_fetch',
        arguments: { url: stubUrl, max_amount: '0.05', quote_only: true },
      })
      const payload = JSON.parse((res.content as { text: string }[])[0].text)
      expect(payload.ok).toBe(true)
      expect(payload.price_atomic).toBe('10000')
    } finally {
      await client.close()
    }
  }, 60_000)
})
```

- [ ] **Step 2: Run it and watch it pass or fail honestly**

```bash
cd /Users/vanhuy/Desktop/celo && pnpm -F leash-agentpay test:bundle
```

Expected: 3 passed. **If the `leash_fetch` case fails with `ERR_MODULE_NOT_FOUND` or `Cannot find package '@leash/sdk'`, stop.** The bundle is wrong and publishing it would ship a server whose third tool is dead. Fix `noExternal` in `mcp/tsup.config.ts` before continuing — do not proceed to Task 3.

- [ ] **Step 3: Confirm the ordinary suite still excludes it**

```bash
cd /Users/vanhuy/Desktop/celo && pnpm -F leash-agentpay test
```

Expected: 20 passed — the bundle test must not run here, because it builds and packs and takes minutes.

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add mcp/test/bundle.test.ts
git commit -m "$(cat <<'MSG'
test(mcp): the one tool a bad bundle would break silently

index.ts:93 imports the SDK dynamically and only inside the `leash_fetch`
branch. A bundle that leaves that import external leaves `leash_status` and
`leash_pay` working perfectly and breaks `leash_fetch` on a user's machine --
and no suite here could see it, because vitest resolves `@leash/sdk` through
the workspace symlink whatever the bundler did.

This runs against the packed tarball instead, and asks `leash_fetch` for a
quote against a local 402 stub. quote_only touches no chain and spends
nothing.

MSG
)"
```

---

### Task 3: Publish `leash-agentpay@0.1.0`

**Files:** none changed. This task's deliverable is a package on the registry and a verification recorded in `docs/deployments.md`.

**Interfaces:**
- Consumes: the verified bundle from Task 2.
- Produces: `npx -y leash-agentpay`, which Task 4 writes into every `.mcp.json`.

- [ ] **Step 1: Authenticate (maintainer action)**

```bash
npm login
npm whoami
```

Expected: your username. `npm whoami` returned `401 Unauthorized` on this machine on 2026-09-06, so this is not optional and cannot be done for you.

- [ ] **Step 2: Inspect exactly what would be published**

```bash
cd /Users/vanhuy/Desktop/celo/mcp && npm publish --dry-run
```

Expected: the file list contains `dist/index.js` and `package.json` and **nothing else** — no `src/`, no `test/`, no `.env`. If `src/` appears, `files` is wrong.

- [ ] **Step 3: Publish**

```bash
cd /Users/vanhuy/Desktop/celo/mcp && npm publish --access public
```

- [ ] **Step 4: Verify from a clean cache, outside the repository**

```bash
cd "$(mktemp -d)" && npm cache clean --force && npx -y leash-agentpay
```

Expected: `Error: OPERATOR_PK is not set. The Leash MCP server needs it to start.`

That error is the pass condition: it proves npm resolved the package, ran the bin, and got as far as reading configuration. Any module-resolution error is a failure — unpublish is possible within 72 hours (`npm unpublish leash-agentpay@0.1.0`), so fix and republish as `0.1.1` rather than leaving a broken version as the `latest` tag.

- [ ] **Step 5: Record it**

Append to `docs/deployments.md` a short section stating the package name, version, publish date, and the exact command and output from Step 4 — this repository records what was observed, not what was expected.

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add docs/deployments.md
git commit -m "docs: record the npm publish and the clean-cache run that verified it"
```

---

### Task 4: Point the app at the published package

**Files:**
- Modify: `app/lib/mcpJson.ts:60-83` (`buildMcpJson`)
- Test: `app/test/mcpJson.test.ts`
- Modify: `docs/mcp-setup.md` (the `.mcp.json` block in section 2, and the prerequisites paragraph in the intro)
- Modify: `README.md` (the Project status section's clone-and-run paragraph)

**Interfaces:**
- Consumes: the published bin name `leash-agentpay` from Task 3.
- Produces: `buildMcpJson` output whose `mcpServers.leash.command` is `npx`. `McpHandoff.tsx`, the landing page and `/setup` all render through this one function and need no change.

- [ ] **Step 1: Write the failing test**

Append to `app/test/mcpJson.test.ts`, inside the existing `describe('buildMcpJson', ...)` block:

```ts
  /**
   * The block used to carry `/absolute/path/to/leash/mcp/src/index.ts`, which
   * the reader had to edit by hand. Getting it wrong surfaces in the agent as
   * "server failed to connect" with the real cause buried -- the same shape of
   * failure as the empty ATTRIBUTION_TAG this file's other tests guard.
   */
  it('installs the published package rather than a path only the author has', () => {
    const server = JSON.parse(buildMcpJson(handoff)).mcpServers.leash
    expect(server.command).toBe('npx')
    expect(server.args).toEqual(['-y', 'leash-agentpay'])
  })

  it('emits no local filesystem path at all', () => {
    expect(buildMcpJson(handoff)).not.toMatch(/\/absolute\/path|\.ts\b/)
  })
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/vanhuy/Desktop/celo && pnpm -F @leash/app test mcpJson
```

Expected: FAIL — `expected 'npx' ... args to equal ['-y','leash-agentpay']`, because the current args are `['-y','tsx','/absolute/path/to/leash/mcp/src/index.ts']`.

- [ ] **Step 3: Make it pass**

In `app/lib/mcpJson.ts`, inside `buildMcpJson`, replace the `args` line:

```ts
          command: 'npx',
          // The published package, not a path on the author's disk. `-y`
          // skips the install prompt, which an agent's runtime cannot answer.
          args: ['-y', 'leash-agentpay'],
```

- [ ] **Step 4: Run the whole app suite**

```bash
cd /Users/vanhuy/Desktop/celo && pnpm -F @leash/app test
```

Expected: 193 passed (191 existing plus the two added here).

- [ ] **Step 5: Update the setup guide**

In `docs/mcp-setup.md`, replace the `command`/`args` lines of the section 2 JSON block to match the new output exactly. Then rewrite the intro paragraph that currently says "The MCP server is run straight from source through `tsx`, and it imports `@leash/sdk` as a workspace package — without `pnpm install` that import does not resolve": with the published package, a reader following this guide no longer needs to clone or run `pnpm install` at all. Say that plainly, and keep the Node >= 20 requirement, which still holds.

- [ ] **Step 6: Update the README's status section**

`README.md` currently states "Distribution is currently clone-and-run" and describes publishing as the next step. That is now false. Replace it with what is true: the server installs from npm as `leash-agentpay`; the SDK remains unpublished by choice, with the one-consumer reasoning intact.

- [ ] **Step 7: Verify the docs and the code agree**

```bash
cd /Users/vanhuy/Desktop/celo && grep -rn "absolute/path" README.md docs/mcp-setup.md app/lib/mcpJson.ts
```

Expected: no matches.

- [ ] **Step 8: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add app/lib/mcpJson.ts app/test/mcpJson.test.ts docs/mcp-setup.md README.md
git commit -m "$(cat <<'MSG'
fix(app): the config block handed strangers a path only the author had

Every reader got `/absolute/path/to/leash/mcp/src/index.ts` and was expected to
edit it. Editing it wrong reaches the user as "server failed to connect", with
the real cause buried in a log their agent does not show -- the same shape of
failure as a46fa52, where the landing shipped a block that could not start.

It emits `npx -y leash-agentpay` now. As with displayTag, the fix lives in the
one builder both the landing and /setup render through, so no caller can
reintroduce it.

MSG
)"
```

---

### Task 5: Continuous integration

292 tests exist and none has ever run automatically. The pack job matters most: it is what stops a broken bundle from reaching a user rather than a reviewer.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm -F leash-agentpay test:bundle` from Task 2.
- Produces: a required status check on pull requests.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { submodules: recursive }
      - uses: foundry-rs/foundry-toolchain@v1
      - run: forge test -vv
        working-directory: contracts

  packages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      # The gate suites are excluded from these scripts on purpose: they spend
      # real money on mainnet. Never add `test:gate` to this workflow.
      - run: pnpm -F @leash/sdk test
      - run: pnpm -F leash-agentpay test
      - run: pnpm -F @leash/app test

      - run: npx tsc --noEmit
        working-directory: sdk
      - run: npx tsc --noEmit
        working-directory: mcp
      - run: npx tsc --noEmit
        working-directory: app
      - run: npx tsc --noEmit
        working-directory: examples
      - run: npx tsc --noEmit
        working-directory: spikes

  bundle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      # Packs the tarball, installs it into a temp directory and starts the
      # bin. This is the only job that can catch a bundle whose dynamic
      # `@leash/sdk` import was left external -- every other suite resolves it
      # through the workspace symlink and passes regardless.
      - run: pnpm -F leash-agentpay test:bundle
```

- [ ] **Step 2: Check the workflow parses before pushing**

```bash
cd /Users/vanhuy/Desktop/celo && node -e "
const {readFileSync}=require('fs');
const s=readFileSync('.github/workflows/ci.yml','utf8');
if(!/^name: CI/m.test(s)) throw new Error('missing name');
// Match only executed \`run:\` lines. A naive /test:gate/ over the whole
// file matches the comment that WARNS against the gate suites, so the check
// fails on a correct workflow and passes on nothing -- a guard that cries
// wolf gets deleted, and then it guards nothing.
if(s.split('\n').some(l=>/^\s*-?\s*run:.*test:gate/.test(l)))
  throw new Error('CI must never run the gate suites');
console.log('workflow looks sane');
"
```

Expected: `workflow looks sane`.

- [ ] **Step 3: Commit and push, then read the run**

```bash
cd /Users/vanhuy/Desktop/celo
git add .github/workflows/ci.yml
git commit -m "$(cat <<'MSG'
ci: 292 tests existed and none of them had ever run automatically

Three jobs: contracts under Foundry, the pnpm suites with typechecking across
all five packages, and the bundle smoke test.

The bundle job is the one that earns its keep. It packs the tarball, installs
it into a temp directory and starts the bin, which is the only way to catch a
bundle that left the dynamic `@leash/sdk` import external -- every other suite
resolves that through the workspace symlink and passes either way.

The gate suites are deliberately absent. They spend real money on mainnet.

MSG
)"
git push
gh run watch
```

Expected: all three jobs green. If `contracts` fails on a missing forge-std, add `git submodule update --init --recursive` — `contracts/lib/forge-std` is vendored.

---

### Task 6: Time the stranger's walk and correct the claim

The README will say five minutes. That number gets measured, not reasoned about.

**Files:**
- Modify: `README.md` (whatever the measurement contradicts)

- [ ] **Step 1: Walk it, with a timer running**

From a machine with no clone and a clean npm cache:

1. Open <https://leash-app-phi.vercel.app/setup>.
2. Connect a wallet, deploy an account, add an operator, set limits, fund it.
3. Copy the `.mcp.json` block, paste the operator key in locally.
4. Restart the agent and call `leash_status`.

Record the wall-clock time and every place you had to stop and think.

- [ ] **Step 2: Exercise the tool an installation can break**

Call `leash_fetch` with `quote_only: true` against any 402-gated URL. Task 2 proves the bundle serves it; this proves a real agent reaches it through a real install.

- [ ] **Step 3: Correct the README against what you measured**

If it took longer than five minutes, change the number in `README.md`. Do not re-describe the walk to fit the claim. If a step made you stop and think, that step is a defect — write it down, and fix it if it is cheap.

- [ ] **Step 4: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add README.md
git commit -m "docs: the install claim now matches a walk somebody actually timed"
```
