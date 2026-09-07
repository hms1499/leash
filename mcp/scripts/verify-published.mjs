#!/usr/bin/env node
/**
 * Walks the PUBLISHED package the way a stranger would, and proves behaviour
 * rather than bytes.
 *
 * `mcp/test/bundle.test.ts` packs a LOCAL tarball and talks to a stub gateway,
 * so it can never observe what the registry is actually serving. Grepping a
 * downloaded bundle proves the bytes shipped and nothing about whether they
 * run. This closes both gaps: cold npm cache, empty directory, install from
 * the registry, and the bin started BY NAME — the command a stranger's MCP
 * client runs — then two real tool calls.
 *
 * Costs nothing. `leash_status` is a read, and `leash_fetch` is called with
 * `quote_only`, which an unpaid 402 answers for free. It does NOT spend, and
 * must never be changed to.
 *
 * Needs the operator key, so it is a script rather than a test:
 *
 *   set -a && . ./.env && set +a && pnpm -F leash-agentpay verify:published 0.2.1
 *
 * It lives under `mcp/` rather than the repo's `scripts/` because it imports
 * the MCP client SDK, which Node resolves from the importing FILE's directory
 * upward — and that package is a dependency of `mcp`, not of the root. From
 * `scripts/` it dies on module resolution before it reaches the registry.
 * `files: ["dist"]` keeps it out of the tarball.
 *
 * The body below is required: usebuy.ai prices from the request body and
 * answers 400 without one. That 400 is how the unguarded quote_only path was
 * found — it escaped as `internal_error` and blamed the user's configuration.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const VERSION = process.argv[2] ?? '0.2.0'
const t0 = Date.now()
const at = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`

const dir = mkdtempSync(join(tmpdir(), 'leash-walk-'))
const cache = mkdtempSync(join(tmpdir(), 'leash-cache-'))
console.log(`${at()} empty dir ${dir}`)
console.log(`${at()} cold npm cache ${cache}`)

execFileSync('npm', ['install', '--silent', '--cache', cache, `leash-agentpay@${VERSION}`],
  { cwd: dir, stdio: 'inherit' })
console.log(`${at()} npm install leash-agentpay@${VERSION} from the registry finished`)

const binDir = join(dir, 'node_modules', '.bin')
console.log(`${at()} bin linked as a command: ${existsSync(join(binDir, 'leash-agentpay'))}`)
const installed = JSON.parse(
  execFileSync('node', ['-p', 'JSON.stringify(require("./node_modules/leash-agentpay/package.json"))'],
    { cwd: dir }).toString())
console.log(`${at()} installed version: ${installed.version}`)
console.log(`${at()} @leash/sdk on disk: ${existsSync(join(dir, 'node_modules', '@leash', 'sdk'))}`)

const need = ['LEASH_ACCOUNT', 'OPERATOR_PK', 'ATTRIBUTION_TAG', 'SPEND_TOKEN', 'FEE_ADAPTER']
for (const k of need) if (!process.env[k]) throw new Error(`${k} is not set; source .env first`)
const env = Object.fromEntries(need.map((k) => [k, process.env[k]]))
if (process.env.CELO_RPC_URL) env.CELO_RPC_URL = process.env.CELO_RPC_URL

const client = new Client({ name: 'registry-walk', version: '0' }, { capabilities: {} })
// By NAME, not by path: this is the command a stranger's MCP client runs.
await client.connect(new StdioClientTransport({
  command: 'leash-agentpay',
  env: { PATH: `${binDir}:${process.env.PATH}`, ...env },
}))
console.log(`${at()} server connected over stdio`)

try {
  const tools = await client.listTools()
  console.log(`${at()} tools: ${tools.tools.map((t) => t.name).join(', ')}`)

  const status = JSON.parse((await client.callTool({ name: 'leash_status', arguments: {} }))
    .content[0].text)
  console.log(`${at()} leash_status (real mainnet read):`)
  console.log(`        account          ${status.account}`)
  console.log(`        remaining_today  ${status.remaining_today}`)
  console.log(`        per_tx_cap       ${status.per_tx_cap}   daily_cap ${status.daily_cap}`)
  console.log(`        account_balance  ${status.account_balance}   operator ${status.operator_balance}`)
  console.log(`        can_spend        ${status.can_spend}      resets_in ${status.resets_in}`)

  const quote = JSON.parse((await client.callTool({
    name: 'leash_fetch',
    arguments: {
      url: 'https://usebuy.ai/gcloud/vm', max_amount: '0.05', quote_only: true,
      body: '{"script":"uname -a","machineType":"e2-micro"}',
    },
  })).content[0].text)
  console.log(`${at()} leash_fetch quote_only (real gateway, nothing paid):`)
  console.log(`        ${JSON.stringify(quote)}`)
} finally {
  await client.close()
  rmSync(dir, { recursive: true, force: true })
  rmSync(cache, { recursive: true, force: true })
}
console.log(`${at()} done`)
