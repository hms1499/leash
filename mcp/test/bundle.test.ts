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
