# Remote MCP over HTTP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user self-host `leash-agentpay` over HTTP with OAuth, so claude.ai can add it as a custom connector.

**Architecture:** Extract the tool registration out of `mcp/src/index.ts` into a `createLeashServer(config)` seam both transports share. Add an Express app that mounts the MCP SDK's own `mcpAuthRouter` (which serves discovery, `/authorize`, `/register`, `/token`, `/revoke` with S256 PKCE and rate limiting) alongside a `POST /mcp` guarded by `requireBearerAuth`. We implement only the `OAuthServerProvider`: a consent page gated by a pairing code printed to stderr, authorization codes bound to PKCE, and rotating refresh tokens hashed to disk so a restart does not force re-pairing.

**Tech Stack:** TypeScript, Node 20, `@modelcontextprotocol/sdk@^1.30.0`, Express 5, viem, vitest, tsup. Express, `express-rate-limit`, `pkce-challenge`, `cors` and `jose` are already hard dependencies of the MCP SDK — **this plan adds no new dependency to `mcp/package.json`.**

**Spec:** `docs/superpowers/specs/2026-09-10-leash-remote-mcp-design.md`

## Global Constraints

- **The stdio transport's behaviour must not change.** `test:bundle` packs the tarball and starts the bin; it is the guard.
- **Never write to stdout in library or http code.** stdout is the JSON-RPC channel in stdio mode. The pairing code and the startup banner go to **stderr**.
- **No new dependency in `mcp/package.json`.** Everything needed already arrives through `@modelcontextprotocol/sdk`.
- **`LEASH_PUBLIC_URL` is the public https origin, no path.** The resource server URL is `${LEASH_PUBLIC_URL}/mcp`; protected resource metadata lands at `${LEASH_PUBLIC_URL}/.well-known/oauth-protected-resource/mcp`. The `resource` field inside that document must equal the resource server URL character for character.
- **Secrets in tests are generated at runtime**, never written as literals — `scripts/check-secrets.sh` runs pre-commit and blocks a 64-hex value unless it is labelled as a transaction hash within 10 characters. Follow `mcp/test/status.test.ts`, which uses `generatePrivateKey()`.
- **Auth and transport failures are real HTTP statuses** (401/403/429), never wrapped as tool errors. Tool failures keep the `errors.ts` JSON contract: an `error` code plus one actionable `suggestion`.
- **Comments explain why**, especially where a line guards a hazard. Match the density of the surrounding code and do not strip existing comments.
- Style: no ESLint or Prettier config exists. Match surrounding code — 2-space indent, no semicolons, single quotes, `type` over `interface` in this package.
- Run `npx tsc --noEmit` in `mcp` (and in `app` for Task 9) before each commit.

---

### Task 1: Extract `createLeashServer`

A pure refactor. It changes no behaviour and exists so there is exactly one copy of the tool list.

**Files:**
- Create: `mcp/src/server.ts`
- Modify: `mcp/src/index.ts` (replace the whole file)
- Test: `mcp/test/parity.test.ts`

**Interfaces:**
- Consumes: `loadConfig` from `./config.js`, `LeashConfig` type.
- Produces: `createLeashServer(config: LeashConfig): Server` — an unconnected `Server` from `@modelcontextprotocol/sdk/server/index.js` with all three tools registered. Tasks 2, 6 and 7 depend on this exact name and signature.

- [ ] **Step 1: Write the failing test**

`mcp/test/parity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { loadConfig } from '../src/config.js'
import { createLeashServer } from '../src/server.js'

const ENV = {
  LEASH_ACCOUNT: '0x7aDa926B021BAef4896F51F237bCA61435E43fd2',
  // Generated, never a literal — see the note in test/status.test.ts.
  OPERATOR_PK: generatePrivateKey(),
  ATTRIBUTION_TAG: 'celo_3dec652cd977',
  SPEND_TOKEN: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  FEE_ADAPTER: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
} as NodeJS.ProcessEnv

/**
 * The tool list is the contract both transports publish. CLAUDE.md's rule is
 * that two implementations of one operation must not behave differently; this
 * asserts the structural version of it — there is only one implementation, so
 * a second copy of the list cannot be introduced without failing here.
 */
describe('createLeashServer', () => {
  it('registers exactly the three documented tools', async () => {
    const server = createLeashServer(loadConfig(ENV))
    const client = new Client({ name: 'parity', version: '0' }, { capabilities: {} })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
      const { tools } = await client.listTools()
      expect(tools.map((t) => t.name).sort()).toEqual(
        ['leash_fetch', 'leash_pay', 'leash_status'],
      )
      // A tool with no description is a tool an agent will misuse.
      for (const tool of tools) expect(tool.description).toBeTruthy()
    } finally {
      await client.close()
      await server.close()
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd mcp && npx vitest run parity`
Expected: FAIL — `Cannot find module '../src/server.js'`.

- [ ] **Step 3: Create `mcp/src/server.ts`**

Move the body of `mcp/src/index.ts` into this file unchanged, except that the module-scope constants become locals of the factory. **Copy every existing comment and every tool `description` string verbatim** — those descriptions are the agent-facing contract and one of them (`leash_pay`) documents the three-outcome confirm behaviour that took real money to learn.

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { privateKeyToAccount } from 'viem/accounts'
import { LeashClient } from '@leash/sdk'
import type { LeashConfig } from './config.js'
import { toolError, toolOk } from './errors.js'
import { statusTool } from './tools/status.js'
import { payTool } from './tools/pay.js'
import { fetchTool } from './tools/fetch.js'

/**
 * Builds the server both transports share.
 *
 * This is a seam, not a layer. It exists so the tool list has exactly one
 * copy: `index.ts` connects it to stdio and `http/app.ts` connects it to
 * Streamable HTTP, and neither owns a description string of its own.
 */
export function createLeashServer(config: LeashConfig): Server {
  const account = privateKeyToAccount(config.operatorPk)
  const leash = new LeashClient({
    account,
    accountAddress: config.accountAddress,
    attributionTag: config.attributionTag,
    rpcUrl: config.rpcUrl,
  })

  // ... the feeBalances() helper, verbatim from index.ts, comment included ...

  const server = new Server(
    { name: 'leash', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  // ... setRequestHandler(ListToolsRequestSchema, ...) verbatim ...
  // ... setRequestHandler(CallToolRequestSchema, ...) verbatim ...

  return server
}
```

- [ ] **Step 4: Replace `mcp/src/index.ts`**

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { createLeashServer } from './server.js'

await createLeashServer(loadConfig(process.env)).connect(new StdioServerTransport())
```

- [ ] **Step 5: Run the suites**

Run: `cd mcp && pnpm test && npx tsc --noEmit`
Expected: 30 passing (29 existing + 1 new), tsc exit 0.

- [ ] **Step 6: Run the bundle suite — this is the real guard on the refactor**

Run: `cd mcp && pnpm test:bundle`
Expected: 3 passing. Minutes, not seconds; it packs a tarball and installs it.

- [ ] **Step 7: Commit**

```bash
git add mcp/src/server.ts mcp/src/index.ts mcp/test/parity.test.ts
git commit -m "refactor(mcp): the tool list had no seam a second transport could reuse"
```

---

### Task 2: Serialise writes behind a mutex

**Files:**
- Create: `mcp/src/mutex.ts`
- Modify: `mcp/src/server.ts` (the `CallToolRequestSchema` handler)
- Test: `mcp/test/mutex.test.ts`

**Interfaces:**
- Produces: `class Mutex { run<T>(fn: () => Promise<T>): Promise<T> }`.

**Why:** `LeashClient` does not manage transaction nonces — viem queries the node on each send. Over stdio one client calls in sequence and this never surfaced. Over HTTP two concurrent tool calls both read nonce *N* and one replaces the other. CLAUDE.md already records the neighbouring lesson ("retry, re-reading the nonce between attempts") and that forno serves stale reads after a confirmed transaction, so a stale pending count is not hypothetical. The lock is therefore held across **send *and* confirm**, not just the send.

- [ ] **Step 1: Write the failing test**

`mcp/test/mutex.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Mutex } from '../src/mutex.js'

describe('Mutex', () => {
  it('never runs two bodies at once', async () => {
    const lock = new Mutex()
    let concurrent = 0
    let peak = 0
    const body = async () => {
      concurrent += 1
      peak = Math.max(peak, concurrent)
      await new Promise((r) => setTimeout(r, 10))
      concurrent -= 1
    }
    await Promise.all([lock.run(body), lock.run(body), lock.run(body)])
    expect(peak).toBe(1)
  })

  it('runs them in the order they queued', async () => {
    const lock = new Mutex()
    const order: number[] = []
    await Promise.all([1, 2, 3].map((n) => lock.run(async () => { order.push(n) })))
    expect(order).toEqual([1, 2, 3])
  })

  /**
   * A rejection must not wedge the lock. Until this passed, one failed spend
   * would leave every later payment hanging forever with no error to read.
   */
  it('releases when the body throws', async () => {
    const lock = new Mutex()
    await expect(lock.run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    await expect(lock.run(async () => 'after')).resolves.toBe('after')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd mcp && npx vitest run mutex`
Expected: FAIL — `Cannot find module '../src/mutex.js'`.

- [ ] **Step 3: Implement `mcp/src/mutex.ts`**

```ts
/**
 * Serialises the write paths.
 *
 * `LeashClient` does not manage nonces; viem asks the node on every send. Two
 * concurrent tool calls read the same nonce and one silently replaces the
 * other — invisible over stdio, where a single client calls in sequence, and
 * reachable the moment a remote transport accepts two requests at once. The
 * lock is held across send AND confirm because CLAUDE.md records forno
 * serving stale reads after a confirmed transaction, so releasing at the
 * hash would hand the next caller a stale pending count.
 */
export class Mutex {
  #tail: Promise<unknown> = Promise.resolve()

  run<T>(fn: () => Promise<T>): Promise<T> {
    // The queue must survive a rejection, so the chain we wait on swallows
    // the outcome; the caller still receives the real result below.
    const result = this.#tail.then(fn, fn)
    this.#tail = result.then(() => undefined, () => undefined)
    return result
  }
}
```

- [ ] **Step 4: Run the test**

Run: `cd mcp && npx vitest run mutex`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into `createLeashServer`**

In `mcp/src/server.ts`, create one lock per server and wrap the two write paths. `leash_status` is a read and must never queue behind a 60-second confirm; `leash_fetch` with `quote_only` spends nothing and must not queue either.

```ts
const writeLock = new Mutex()
```

Inside the `CallToolRequestSchema` handler:

```ts
      case 'leash_pay':
        // Held across send and confirm — see mutex.ts.
        return toolOk(await writeLock.run(() => payTool(
          { leash: leash as never, config, feeBalances: await feeBalances() },
          req.params.arguments as { to: string; amount: string },
        )))
      case 'leash_fetch': {
        const args = req.params.arguments as { quote_only?: boolean }
        const { quote, payForResource } = await import('@leash/sdk')
        const call = () => fetchTool(/* ...unchanged deps and args... */)
        // A quote signs nothing and moves nothing. Queueing it behind a
        // payment's confirm would make asking the price cost a minute.
        return toolOk(args.quote_only === true ? await call() : await writeLock.run(call))
      }
```

- [ ] **Step 6: Run the suites**

Run: `cd mcp && pnpm test && npx tsc --noEmit`
Expected: 33 passing, tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add mcp/src/mutex.ts mcp/src/server.ts mcp/test/mutex.test.ts
git commit -m "fix(mcp): two concurrent tool calls would have taken the same nonce"
```

---

### Task 3: Persist grants

**Files:**
- Create: `mcp/src/http/grants.ts`
- Test: `mcp/test/grants.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StoredGrant = { refreshHash: string; clientId: string; issuedAt: number }
  export function hashToken(token: string): string          // sha256 hex
  export class GrantStore {
    static open(path: string): Promise<GrantStore>
    getClient(clientId: string): OAuthClientInformationFull | undefined
    addClient(client: OAuthClientInformationFull): Promise<void>
    addGrant(refreshToken: string, clientId: string): Promise<void>
    takeGrant(refreshToken: string): StoredGrant | undefined  // finds and removes, for rotation
    removeGrantsForClient(clientId: string): Promise<void>
    persist(): Promise<void>
  }
  ```
  Task 4 consumes all of these.

- [ ] **Step 1: Write the failing test**

`mcp/test/grants.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { GrantStore, hashToken } from '../src/http/grants.js'

let dir: string
let path: string
const client = {
  client_id: 'client-1',
  client_id_issued_at: 1_757_000_000,
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  token_endpoint_auth_method: 'none',
} as never

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'leash-grants-'))
  path = join(dir, 'grants.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('GrantStore', () => {
  it('starts empty when the file does not exist yet', async () => {
    const store = await GrantStore.open(path)
    expect(store.getClient('client-1')).toBeUndefined()
  })

  /**
   * The file holds refresh-token material. World-readable is the difference
   * between "a stranger on this box can read your grants" and not.
   */
  it('writes the file 0600', async () => {
    const store = await GrantStore.open(path)
    await store.addClient(client)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('never writes a refresh token in the clear', async () => {
    const store = await GrantStore.open(path)
    const refresh = randomBytes(32).toString('base64url')
    await store.addClient(client)
    await store.addGrant(refresh, 'client-1')
    expect(readFileSync(path, 'utf8')).not.toContain(refresh)
    expect(readFileSync(path, 'utf8')).toContain(hashToken(refresh))
  })

  /**
   * The whole reason the file exists: a restart must not force the user to
   * read a new pairing code off a terminal they may have closed.
   */
  it('restores clients and grants after a reopen', async () => {
    const refresh = randomBytes(32).toString('base64url')
    const first = await GrantStore.open(path)
    await first.addClient(client)
    await first.addGrant(refresh, 'client-1')

    const second = await GrantStore.open(path)
    expect(second.getClient('client-1')?.redirect_uris)
      .toEqual(['https://claude.ai/api/mcp/auth_callback'])
    expect(second.takeGrant(refresh)?.clientId).toBe('client-1')
  })

  it('consumes a grant exactly once, so a rotated refresh token dies', async () => {
    const refresh = randomBytes(32).toString('base64url')
    const store = await GrantStore.open(path)
    await store.addClient(client)
    await store.addGrant(refresh, 'client-1')
    expect(store.takeGrant(refresh)).toBeDefined()
    expect(store.takeGrant(refresh)).toBeUndefined()
  })

  /**
   * Starting anyway with zero grants presents to the user as "Claude broke my
   * connector" when the real problem is a damaged file, and the cause is
   * unreadable from the symptom.
   */
  it('fails loudly on a corrupt file, naming the path', async () => {
    writeFileSync(path, '{ not json', { mode: 0o600 })
    await expect(GrantStore.open(path)).rejects.toThrow(path)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd mcp && npx vitest run grants`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/src/http/grants.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js'

export type StoredGrant = { refreshHash: string; clientId: string; issuedAt: number }

type FileShape = {
  version: 1
  clients: OAuthClientInformationFull[]
  grants: StoredGrant[]
}

/** Refresh tokens are stored as digests, so a readable file is not a usable one. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export class GrantStore {
  #path: string
  #data: FileShape

  private constructor(path: string, data: FileShape) {
    this.#path = path
    this.#data = data
  }

  static async open(path: string): Promise<GrantStore> {
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (err) {
      // Absent is the ordinary first run. Anything else is a real failure and
      // must not be flattened into "start empty".
      if ((err as { code?: string }).code === 'ENOENT') {
        return new GrantStore(path, { version: 1, clients: [], grants: [] })
      }
      throw new Error(`could not read the grant file at ${path}: ${(err as Error).message}`)
    }
    let parsed: FileShape
    try {
      parsed = JSON.parse(raw)
      if (parsed.version !== 1 || !Array.isArray(parsed.clients) || !Array.isArray(parsed.grants)) {
        throw new Error('unexpected shape')
      }
    } catch (err) {
      throw new Error(
        `the grant file at ${path} is not readable Leash state (${(err as Error).message}). ` +
        'Delete it to start fresh — you will have to pair the connector again.',
      )
    }
    return new GrantStore(path, parsed)
  }

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return this.#data.clients.find((c) => c.client_id === clientId)
  }

  async addClient(client: OAuthClientInformationFull): Promise<void> {
    this.#data.clients = this.#data.clients.filter((c) => c.client_id !== client.client_id)
    this.#data.clients.push(client)
    await this.persist()
  }

  async addGrant(refreshToken: string, clientId: string): Promise<void> {
    this.#data.grants.push({
      refreshHash: hashToken(refreshToken), clientId, issuedAt: Math.floor(Date.now() / 1000),
    })
    await this.persist()
  }

  /**
   * Finds and removes in one step.
   *
   * Rotation is required for public clients, and DCR registers Claude as one.
   * A `has` followed by a separate `remove` is a window in which the same
   * refresh token is spendable twice.
   */
  takeGrant(refreshToken: string): StoredGrant | undefined {
    const hash = hashToken(refreshToken)
    const index = this.#data.grants.findIndex((g) => g.refreshHash === hash)
    if (index === -1) return undefined
    const [grant] = this.#data.grants.splice(index, 1)
    // Deliberately not awaited: the caller is inside a token exchange with a
    // 10-second budget, and the in-memory removal is what makes the token
    // unusable. persist() is called by the caller after it mints the new one.
    return grant
  }

  async removeGrantsForClient(clientId: string): Promise<void> {
    this.#data.grants = this.#data.grants.filter((g) => g.clientId !== clientId)
    await this.persist()
  }

  async persist(): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 })
    // Written to a sibling and renamed: a crash mid-write would otherwise
    // leave the truncated file that open() above refuses to load.
    const tmp = `${this.#path}.${randomBytes(6).toString('hex')}.tmp`
    await writeFile(tmp, JSON.stringify(this.#data, null, 2), { mode: 0o600 })
    await rename(tmp, this.#path)
  }
}
```

- [ ] **Step 4: Run the test**

Run: `cd mcp && npx vitest run grants`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/src/http/grants.ts mcp/test/grants.test.ts
git commit -m "feat(mcp): persist OAuth grants so a restart does not force re-pairing"
```

---

### Task 4: The OAuth provider

The security-bearing task. Everything the SDK does not do for us lives here.

**Files:**
- Create: `mcp/src/http/provider.ts`
- Test: `mcp/test/provider.test.ts`

**Interfaces:**
- Consumes: `GrantStore`, `hashToken` (Task 3); `renderConsent` (Task 5 — write Task 5 first if executing in order, or stub it as `() => ''` and fill it in during Task 5).
- Produces:
  ```ts
  export function newPairingCode(): string     // e.g. "K7QM-3F8P-XB2R"
  export class LeashOAuthProvider implements OAuthServerProvider {
    constructor(opts: { pairingCode: string; store: GrantStore; resourceUrl: URL })
    get clientsStore(): OAuthRegisteredClientsStore
    authorize(client, params, res): Promise<void>
    challengeForAuthorizationCode(client, code): Promise<string>
    exchangeAuthorizationCode(client, code, codeVerifier?, redirectUri?, resource?): Promise<OAuthTokens>
    exchangeRefreshToken(client, refreshToken, scopes?, resource?): Promise<OAuthTokens>
    verifyAccessToken(token): Promise<AuthInfo>
    revokeToken(client, request): Promise<void>
    approve(requestId: string, submittedCode: string): Promise<string>  // returns the redirect URL
  }
  ```
  Task 6 consumes `clientsStore`, `verifyAccessToken`, `authorize` (through the router) and `approve` (directly, from `POST /consent`).

- [ ] **Step 1: Write the failing test**

`mcp/test/provider.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GrantStore } from '../src/http/grants.js'
import { LeashOAuthProvider, newPairingCode } from '../src/http/provider.js'

const RESOURCE = new URL('https://leash.example/mcp')
const CLIENT = {
  client_id: 'client-1',
  client_id_issued_at: 1_757_000_000,
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  token_endpoint_auth_method: 'none',
} as never

let dir: string
let provider: LeashOAuthProvider
let store: GrantStore
const CODE = 'K7QM-3F8P-XB2R'

/** A stand-in for express's Response: authorize() only ever writes HTML. */
function fakeRes() {
  const sent: { status?: number; body?: string } = {}
  return {
    sent,
    setHeader: () => undefined,
    status(code: number) { sent.status = code; return this },
    send(body: string) { sent.body = body; return this },
  } as never
}

/** The request_id the consent form carries, dug out of the rendered HTML. */
function requestIdFrom(html: string): string {
  const match = /name="request_id" value="([^"]+)"/.exec(html)
  if (match === null) throw new Error('the consent page carried no request_id')
  return match[1]
}

async function startAuthorize(codeChallenge = 'challenge-abc') {
  const res = fakeRes()
  await provider.authorize(CLIENT, {
    codeChallenge,
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    state: 'state-xyz',
    resource: RESOURCE,
  }, res)
  return requestIdFrom((res as unknown as { sent: { body: string } }).sent.body)
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'leash-provider-'))
  store = await GrantStore.open(join(dir, 'grants.json'))
  await store.addClient(CLIENT)
  provider = new LeashOAuthProvider({ pairingCode: CODE, store, resourceUrl: RESOURCE })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('newPairingCode', () => {
  it('is three groups of four from an unambiguous alphabet', () => {
    expect(newPairingCode()).toMatch(/^[0-9A-HJ-NP-Z]{4}-[0-9A-HJ-NP-Z]{4}-[0-9A-HJ-NP-Z]{4}$/)
  })

  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 50 }, newPairingCode)).size).toBe(50)
  })
})

describe('the consent gate', () => {
  it('refuses a wrong pairing code', async () => {
    const requestId = await startAuthorize()
    await expect(provider.approve(requestId, 'AAAA-BBBB-CCCC')).rejects.toThrow(/pairing code/i)
  })

  /** Dashes and case are how a human retypes a code, not a wrong code. */
  it('accepts the right code however it was retyped', async () => {
    const requestId = await startAuthorize()
    const redirect = await provider.approve(requestId, ' k7qm3f8p xb2r ')
    expect(redirect).toContain('https://claude.ai/api/mcp/auth_callback?code=')
    expect(redirect).toContain('state=state-xyz')
  })

  it('refuses an unknown request id', async () => {
    await expect(provider.approve('never-issued', CODE)).rejects.toThrow(/request/i)
  })

  /** A consent request is single-use; a replayed form post must not mint a second code. */
  it('consumes the request id', async () => {
    const requestId = await startAuthorize()
    await provider.approve(requestId, CODE)
    await expect(provider.approve(requestId, CODE)).rejects.toThrow(/request/i)
  })

  /**
   * The page must not carry redirect_uri or code_challenge in a form field.
   * Hidden fields are attacker-controllable input, and this repo's rule is
   * that such input never gates anything that matters.
   */
  it('puts nothing but the request id in the form', async () => {
    const res = fakeRes()
    await provider.authorize(CLIENT, {
      codeChallenge: 'challenge-abc',
      redirectUri: 'https://claude.ai/api/mcp/auth_callback',
      state: 'state-xyz',
      resource: RESOURCE,
    }, res)
    const html = (res as unknown as { sent: { body: string } }).sent.body
    expect(html).not.toContain('challenge-abc')
    expect(html).not.toContain('claude.ai/api/mcp/auth_callback')
  })
})

describe('the authorization code', () => {
  async function mintCode() {
    const requestId = await startAuthorize()
    const redirect = await provider.approve(requestId, CODE)
    return new URL(redirect).searchParams.get('code')!
  }

  it('returns the challenge it was minted with, for the SDK to verify PKCE against', async () => {
    expect(await provider.challengeForAuthorizationCode(CLIENT, await mintCode()))
      .toBe('challenge-abc')
  })

  it('is single-use', async () => {
    const code = await mintCode()
    await provider.exchangeAuthorizationCode(CLIENT, code)
    await expect(provider.exchangeAuthorizationCode(CLIENT, code)).rejects.toThrow()
  })

  it('is refused for a different client than the one it was issued to', async () => {
    const code = await mintCode()
    const other = { ...CLIENT, client_id: 'client-2' } as never
    await expect(provider.exchangeAuthorizationCode(other, code)).rejects.toThrow()
  })

  it('is refused once expired', async () => {
    const code = await mintCode()
    provider.expireForTest(code)
    await expect(provider.exchangeAuthorizationCode(CLIENT, code)).rejects.toThrow(/expired/i)
  })

  it('mints an access token that verifies, carrying the resource', async () => {
    const tokens = await provider.exchangeAuthorizationCode(CLIENT, await mintCode())
    const info = await provider.verifyAccessToken(tokens.access_token)
    expect(info.clientId).toBe('client-1')
    expect(info.resource?.href).toBe(RESOURCE.href)
  })
})

describe('refresh', () => {
  async function firstTokens() {
    const requestId = await startAuthorize()
    const redirect = await provider.approve(requestId, CODE)
    const code = new URL(redirect).searchParams.get('code')!
    return provider.exchangeAuthorizationCode(CLIENT, code)
  }

  it('rotates: the old refresh token stops working', async () => {
    const first = await firstTokens()
    const second = await provider.exchangeRefreshToken(CLIENT, first.refresh_token!)
    expect(second.refresh_token).not.toBe(first.refresh_token)
    await expect(provider.exchangeRefreshToken(CLIENT, first.refresh_token!)).rejects.toThrow()
  })

  /** The point of persisting: a fresh process still honours the refresh token. */
  it('survives a process restart', async () => {
    const first = await firstTokens()
    const reopened = await GrantStore.open(join(dir, 'grants.json'))
    const fresh = new LeashOAuthProvider({
      pairingCode: newPairingCode(), store: reopened, resourceUrl: RESOURCE,
    })
    await expect(fresh.exchangeRefreshToken(CLIENT, first.refresh_token!)).resolves.toBeDefined()
  })

  it('refuses an unknown refresh token', async () => {
    await expect(provider.exchangeRefreshToken(CLIENT, 'not-a-token')).rejects.toThrow()
  })
})

describe('verifyAccessToken', () => {
  it('refuses an unknown token', async () => {
    await expect(provider.verifyAccessToken('nope')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd mcp && npx vitest run provider`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/src/http/provider.ts`**

```ts
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Response } from 'express'
import {
  InvalidGrantError, InvalidRequestError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js'
import type {
  AuthorizationParams, OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js'
import type {
  OAuthRegisteredClientsStore,
} from '@modelcontextprotocol/sdk/server/auth/clients.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type {
  OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { GrantStore } from './grants.js'
import { renderConsent } from './consent.js'

/** Crockford-ish: no I, L, O or U, so a retyped code is unambiguous. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const PENDING_TTL_MS = 5 * 60_000
const CODE_TTL_MS = 60_000
const ACCESS_TTL_S = 3600

export function newPairingCode(): string {
  const pick = () => Array.from(randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${pick()}-${pick()}-${pick()}`
}

/** Case and separators are typing, not identity. */
function normalise(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

/**
 * Compared as digests so the comparison is both constant-time and
 * length-independent: `timingSafeEqual` throws on a length mismatch, which
 * would leak the code's length through an exception.
 */
function sameCode(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash('sha256').update(normalise(a)).digest(),
    createHash('sha256').update(normalise(b)).digest(),
  )
}

type Pending = { client: OAuthClientInformationFull; params: AuthorizationParams; expiresAt: number }
type IssuedCode = {
  clientId: string; redirectUri: string; codeChallenge: string
  resource?: URL; expiresAt: number
}
type Access = { clientId: string; resource?: URL; expiresAt: number }

export class LeashOAuthProvider implements OAuthServerProvider {
  readonly #pairingCode: string
  readonly #store: GrantStore
  readonly #resourceUrl: URL
  /**
   * Authorization parameters live here, keyed by an id the form carries,
   * rather than in hidden fields. A hidden field is attacker-controllable
   * input, and a `redirect_uri` an attacker can edit is an open redirect that
   * hands them the authorization code.
   */
  readonly #pending = new Map<string, Pending>()
  readonly #codes = new Map<string, IssuedCode>()
  /** Access tokens are memory-only: short-lived, and a restart costs one refresh. */
  readonly #access = new Map<string, Access>()

  constructor(opts: { pairingCode: string; store: GrantStore; resourceUrl: URL }) {
    this.#pairingCode = opts.pairingCode
    this.#store = opts.store
    this.#resourceUrl = opts.resourceUrl
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => this.#store.getClient(clientId),
      /**
       * Accepts any client. This server has exactly one principal — whoever
       * can read the pairing code off its terminal — so registration is not
       * where access is decided; consent is. The SDK's register handler has
       * already generated the id and secret by the time this is called.
       */
      registerClient: async (client) => {
        await this.#store.addClient(client as OAuthClientInformationFull)
        return client as OAuthClientInformationFull
      },
    }
  }

  async authorize(
    client: OAuthClientInformationFull, params: AuthorizationParams, res: Response,
  ): Promise<void> {
    this.#sweep()
    const requestId = randomUUID()
    this.#pending.set(requestId, { client, params, expiresAt: Date.now() + PENDING_TTL_MS })
    res.setHeader('content-type', 'text/html; charset=utf-8')
    // No-store: the page carries a form that mints an authorization code.
    res.setHeader('cache-control', 'no-store')
    res.status(200).send(renderConsent({ requestId, clientName: client.client_name }))
  }

  /**
   * Called by POST /consent, not by the SDK.
   *
   * Returns the URL to redirect to. Throws on any failure, and the caller
   * renders that as a page rather than redirecting — a failed consent must
   * not send anything to the client's redirect URI.
   */
  async approve(requestId: string, submittedCode: string): Promise<string> {
    this.#sweep()
    const pending = this.#pending.get(requestId)
    if (pending === undefined) {
      throw new InvalidRequestError('this consent request has expired or was already used')
    }
    // Deleted before the code is checked, so a wrong guess burns the request
    // rather than giving an attacker unlimited tries against one id.
    this.#pending.delete(requestId)
    if (!sameCode(submittedCode, this.#pairingCode)) {
      throw new InvalidRequestError('that is not the pairing code this server printed')
    }

    const code = randomBytes(32).toString('base64url')
    this.#codes.set(code, {
      clientId: pending.client.client_id,
      redirectUri: pending.params.redirectUri,
      codeChallenge: pending.params.codeChallenge,
      resource: pending.params.resource,
      expiresAt: Date.now() + CODE_TTL_MS,
    })
    const redirect = new URL(pending.params.redirectUri)
    redirect.searchParams.set('code', code)
    if (pending.params.state !== undefined) redirect.searchParams.set('state', pending.params.state)
    return redirect.href
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull, authorizationCode: string,
  ): Promise<string> {
    return this.#requireCode(client, authorizationCode).codeChallenge
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull, authorizationCode: string,
    _codeVerifier?: string, redirectUri?: string,
  ): Promise<OAuthTokens> {
    const issued = this.#requireCode(client, authorizationCode)
    if (redirectUri !== undefined && redirectUri !== issued.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the one this code was issued for')
    }
    // Single-use: consumed here, before any token exists.
    this.#codes.delete(authorizationCode)
    return this.#mint(client.client_id, issued.resource)
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull, refreshToken: string,
  ): Promise<OAuthTokens> {
    // Rotation is required for public clients, and DCR registers Claude as
    // one. takeGrant finds and removes in a single step so the same token is
    // never spendable twice.
    const grant = this.#store.takeGrant(refreshToken)
    if (grant === undefined || grant.clientId !== client.client_id) {
      throw new InvalidGrantError('that refresh token is not valid')
    }
    return this.#mint(client.client_id, this.#resourceUrl)
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const found = this.#access.get(token)
    if (found === undefined) throw new InvalidGrantError('unknown access token')
    if (found.expiresAt <= Date.now()) {
      this.#access.delete(token)
      throw new InvalidGrantError('access token expired')
    }
    return {
      token,
      clientId: found.clientId,
      scopes: [],
      expiresAt: Math.floor(found.expiresAt / 1000),
      resource: found.resource,
    }
  }

  async revokeToken(
    client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    this.#access.delete(request.token)
    this.#store.takeGrant(request.token)
    await this.#store.removeGrantsForClient(client.client_id)
  }

  /** Test seam: forces a minted code past its TTL without waiting a minute. */
  expireForTest(code: string): void {
    const issued = this.#codes.get(code)
    if (issued !== undefined) issued.expiresAt = Date.now() - 1
  }

  async #mint(clientId: string, resource: URL | undefined): Promise<OAuthTokens> {
    const accessToken = randomBytes(32).toString('base64url')
    const refreshToken = randomBytes(32).toString('base64url')
    this.#access.set(accessToken, {
      clientId, resource, expiresAt: Date.now() + ACCESS_TTL_S * 1000,
    })
    await this.#store.addGrant(refreshToken, clientId)
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_S,
      refresh_token: refreshToken,
    }
  }

  #requireCode(client: OAuthClientInformationFull, code: string): IssuedCode {
    const issued = this.#codes.get(code)
    if (issued === undefined) throw new InvalidGrantError('unknown authorization code')
    if (issued.expiresAt <= Date.now()) {
      this.#codes.delete(code)
      throw new InvalidGrantError('that authorization code has expired')
    }
    if (issued.clientId !== client.client_id) {
      throw new InvalidGrantError('that authorization code was issued to another client')
    }
    return issued
  }

  /** Bounded memory: neither map is ever read after its entry expires. */
  #sweep(): void {
    const now = Date.now()
    for (const [id, p] of this.#pending) if (p.expiresAt <= now) this.#pending.delete(id)
    for (const [code, c] of this.#codes) if (c.expiresAt <= now) this.#codes.delete(code)
    for (const [token, a] of this.#access) if (a.expiresAt <= now) this.#access.delete(token)
  }
}
```

- [ ] **Step 4: Run the test**

Run: `cd mcp && npx vitest run provider`
Expected: PASS, 16 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd mcp && npx tsc --noEmit
git add mcp/src/http/provider.ts mcp/test/provider.test.ts
git commit -m "feat(mcp): an OAuth provider whose consent is gated by a code only the operator can read"
```

---

### Task 5: The consent page

**Files:**
- Create: `mcp/src/http/consent.ts`
- Test: covered by `provider.test.ts` (the form-contents assertions) plus the case below.

**Interfaces:**
- Produces: `renderConsent(opts: { requestId: string; clientName?: string }): string` and `renderConsentError(message: string): string`. Task 4 consumes the first; Task 6 consumes both.

- [ ] **Step 1: Write the failing test**

Append to `mcp/test/provider.test.ts`:

```ts
import { renderConsent } from '../src/http/consent.js'

describe('renderConsent', () => {
  it('carries the request id and a code field', () => {
    const html = renderConsent({ requestId: 'req-1' })
    expect(html).toContain('name="request_id" value="req-1"')
    expect(html).toContain('name="pairing_code"')
    expect(html).toContain('action="/consent"')
  })

  /**
   * client_name arrives from dynamic client registration, which means it is
   * attacker-supplied text rendered into a page the operator is about to
   * approve. Escaped, or a hostile registration writes the page.
   */
  it('escapes a client name that tries to write markup', () => {
    const html = renderConsent({ requestId: 'req-1', clientName: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd mcp && npx vitest run provider`
Expected: FAIL — `Cannot find module '../src/http/consent.js'`.

- [ ] **Step 3: Implement `mcp/src/http/consent.ts`**

One inline template. No templating dependency, and no external stylesheet or script — the page must render on a machine with no network path to anything but itself.

```ts
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ))
}

const STYLE = `
  body { background:#0d0d0d; color:#e8e8e8; font:16px/1.5 -apple-system,system-ui,sans-serif;
         margin:0; display:grid; place-items:center; min-height:100vh; padding:24px }
  main { max-width:34rem }
  h1 { font-size:1.25rem; margin:0 0 1rem }
  p { color:#a0a0a0 }
  input { font:inherit; font-variant-numeric:tabular-nums; letter-spacing:.08em;
          width:100%; padding:12px; margin:8px 0 16px; background:#1a1a1a;
          border:1px solid #333; border-radius:4px; color:#e8e8e8; text-transform:uppercase }
  button { font:inherit; padding:12px 20px; border:0; border-radius:4px;
           background:#fcff52; color:#0d0d0d; cursor:pointer }
  code { color:#e8e8e8 }
`

/**
 * The page the operator sees when Claude asks for access.
 *
 * It says who is asking and where the page came from, because the whole
 * security model rests on the person reading it knowing that this form is
 * served by their own machine and gated by a code only their terminal has.
 */
export function renderConsent(opts: { requestId: string; clientName?: string }): string {
  const who = opts.clientName === undefined
    ? 'A client'
    : `<code>${escapeHtml(opts.clientName)}</code>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorise Leash</title><style>${STYLE}</style></head><body><main>
<h1>Authorise access to your agent wallet</h1>
<p>${who} is asking to use this Leash server. It will be able to read your
balances and to spend up to the caps your account enforces on-chain.</p>
<p>This page is served by <strong>your own machine</strong>. Paste the pairing
code the server printed to its terminal when it started.</p>
<form method="post" action="/consent">
<input type="hidden" name="request_id" value="${escapeHtml(opts.requestId)}">
<label for="pairing_code">Pairing code</label>
<input id="pairing_code" name="pairing_code" autocomplete="off" autofocus
 placeholder="XXXX-XXXX-XXXX" spellcheck="false">
<button type="submit">Authorise</button>
</form></main></body></html>`
}

/**
 * Rendered instead of a redirect.
 *
 * A failed consent must not send anything to the client's redirect URI: the
 * only party who should learn that the code was wrong is the person typing it.
 */
export function renderConsentError(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not authorised</title><style>${STYLE}</style></head><body><main>
<h1>Not authorised</h1><p>${escapeHtml(message)}</p>
<p>Close this tab and press Connect again in Claude to start over.</p>
</main></body></html>`
}
```

- [ ] **Step 4: Run the test**

Run: `cd mcp && npx vitest run provider`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/src/http/consent.ts mcp/test/provider.test.ts
git commit -m "feat(mcp): a consent page that says whose machine is serving it"
```

---

### Task 6: The Express app

**Files:**
- Create: `mcp/src/http/app.ts`, `mcp/src/http/anthropicIps.ts`
- Test: `mcp/test/app.test.ts`, `mcp/test/anthropicIps.test.ts`

**Interfaces:**
- Consumes: `createLeashServer` (Task 1), `GrantStore` (Task 3), `LeashOAuthProvider` (Task 4), `renderConsentError` (Task 5).
- Produces:
  ```ts
  export type HttpOptions = {
    config: LeashConfig
    publicUrl: URL          // origin, no path
    pairingCode: string
    grantsPath: string
    anthropicOnly: boolean
  }
  export function buildApp(opts: HttpOptions): Promise<express.Express>
  export function isAnthropicIp(ip: string): boolean
  ```
  Task 7 consumes `buildApp` and `HttpOptions`.

- [ ] **Step 1: Write the failing tests**

`mcp/test/anthropicIps.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isAnthropicIp } from '../src/http/anthropicIps.js'

/** 160.79.104.0/21 covers 160.79.104.0 – 160.79.111.255. */
describe('isAnthropicIp', () => {
  it.each(['160.79.104.0', '160.79.107.42', '160.79.111.255'])('accepts %s', (ip) => {
    expect(isAnthropicIp(ip)).toBe(true)
  })

  it.each(['160.79.103.255', '160.79.112.0', '8.8.8.8', 'not-an-ip'])('rejects %s', (ip) => {
    expect(isAnthropicIp(ip)).toBe(false)
  })

  /** Express reports IPv4 as ::ffff:a.b.c.d behind some proxies. */
  it('understands an IPv4-mapped IPv6 address', () => {
    expect(isAnthropicIp('::ffff:160.79.107.42')).toBe(true)
  })
})
```

`mcp/test/app.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server as HttpServer } from 'node:http'
import { generatePrivateKey } from 'viem/accounts'
import { loadConfig } from '../src/config.js'
import { buildApp } from '../src/http/app.js'

const ENV = {
  LEASH_ACCOUNT: '0x7aDa926B021BAef4896F51F237bCA61435E43fd2',
  OPERATOR_PK: generatePrivateKey(),
  ATTRIBUTION_TAG: 'celo_3dec652cd977',
  SPEND_TOKEN: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  FEE_ADAPTER: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
} as NodeJS.ProcessEnv

// The public URL a real deployment would have. Discovery documents must quote
// it, not the loopback address the test server actually listens on.
const PUBLIC = new URL('https://leash.example')
let dir: string
let http: HttpServer
let base: string

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'leash-app-'))
  const app = await buildApp({
    config: loadConfig(ENV),
    publicUrl: PUBLIC,
    pairingCode: 'K7QM-3F8P-XB2R',
    grantsPath: join(dir, 'grants.json'),
    anthropicOnly: false,
  })
  http = app.listen(0, '127.0.0.1')
  await new Promise<void>((r) => http.once('listening', r))
  base = `http://127.0.0.1:${(http.address() as { port: number }).port}`
})

afterAll(async () => {
  await new Promise<void>((r) => http.close(() => r()))
  rmSync(dir, { recursive: true, force: true })
})

describe('POST /mcp', () => {
  /**
   * The 401 is load-bearing. Claude does not honour WWW-Authenticate on a 200,
   * and without the resource_metadata pointer it has to guess where discovery
   * lives — the documented quiet failure where the MCP server sees the first
   * request and the authorization server sees no traffic at all.
   */
  it('answers an unauthenticated call with 401 and a resource_metadata pointer', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
    const header = res.headers.get('www-authenticate') ?? ''
    expect(header).toMatch(/^Bearer/)
    expect(header).toContain(
      'resource_metadata="https://leash.example/.well-known/oauth-protected-resource/mcp"',
    )
  })

  /** An auth failure is an HTTP status, never a tool error an agent will try to debug. */
  it('does not dress the refusal up as a JSON-RPC result', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer not-a-real-token',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(401)
    expect(await res.text()).not.toContain('"result"')
  })
})

describe('discovery', () => {
  it('advertises the resource server URL character for character', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resource).toBe('https://leash.example/mcp')
    expect(body.authorization_servers).toEqual(['https://leash.example'])
  })

  it('advertises S256 PKCE and the endpoints the flow needs', async () => {
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`)
    const body = await res.json()
    expect(body.code_challenge_methods_supported).toContain('S256')
    expect(body.authorization_endpoint).toBe('https://leash.example/authorize')
    expect(body.token_endpoint).toBe('https://leash.example/token')
    expect(body.registration_endpoint).toBe('https://leash.example/register')
  })
})

describe('the consent form', () => {
  it('refuses a wrong pairing code without redirecting anywhere', async () => {
    const res = await fetch(`${base}/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ request_id: 'nope', pairing_code: 'AAAA-BBBB-CCCC' }),
      redirect: 'manual',
    })
    expect(res.status).toBe(400)
    expect(res.headers.get('location')).toBeNull()
  })
})

describe('the whole OAuth loop', () => {
  /**
   * The end-to-end case: register a client, walk consent with the pairing
   * code, exchange the code with a real S256 verifier, and call tools/list
   * with the access token. If this passes, claude.ai can connect.
   */
  it('registers, consents, exchanges and then lists tools', async () => {
    const registration = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'test client',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    })
    expect(registration.status).toBe(201)
    const { client_id: clientId } = await registration.json()

    const { default: pkceChallenge } = await import('pkce-challenge')
    const { code_verifier: verifier, code_challenge: challenge } = await pkceChallenge()

    const authorize = await fetch(
      `${base}/authorize?${new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'state-xyz',
        resource: 'https://leash.example/mcp',
      })}`,
    )
    const html = await authorize.text()
    const requestId = /name="request_id" value="([^"]+)"/.exec(html)![1]

    const consent = await fetch(`${base}/consent`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ request_id: requestId, pairing_code: 'K7QM-3F8P-XB2R' }),
      redirect: 'manual',
    })
    expect(consent.status).toBe(302)
    const code = new URL(consent.headers.get('location')!).searchParams.get('code')!

    const token = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        resource: 'https://leash.example/mcp',
      }),
    })
    expect(token.status).toBe(200)
    const { access_token: accessToken } = await token.json()

    const tools = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
      }),
    })
    expect(tools.status).toBe(200)
  }, 30_000)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd mcp && npx vitest run app anthropicIps`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `mcp/src/http/anthropicIps.ts`**

```ts
/**
 * Anthropic's documented outbound range for connector traffic.
 *
 * Guarded behind an opt-in flag, never on by default: a CIDR hardwired into a
 * published bin becomes a silent outage the day Anthropic adds a range, and
 * "connector stopped working" gives the user no path to that cause.
 */
const BASE = (160 << 24) | (79 << 16) | (104 << 8)
const MASK = 0xffff_f800  // /21

export function isAnthropicIp(ip: string): boolean {
  // Express reports IPv4 as ::ffff:a.b.c.d behind some proxies.
  const bare = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  const octets = bare.split('.')
  if (octets.length !== 4) return false
  let value = 0
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return false
    const n = Number(octet)
    if (n > 255) return false
    value = (value << 8) | n
  }
  return ((value >>> 0) & MASK) === (BASE & MASK)
}
```

- [ ] **Step 4: Implement `mcp/src/http/app.ts`**

```ts
import express from 'express'
import { randomUUID } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import type { LeashConfig } from '../config.js'
import { createLeashServer } from '../server.js'
import { GrantStore } from './grants.js'
import { LeashOAuthProvider } from './provider.js'
import { renderConsentError } from './consent.js'
import { isAnthropicIp } from './anthropicIps.js'

export type HttpOptions = {
  config: LeashConfig
  /** The public https origin, with no path. */
  publicUrl: URL
  pairingCode: string
  grantsPath: string
  anthropicOnly: boolean
}

export async function buildApp(opts: HttpOptions): Promise<express.Express> {
  const resourceUrl = new URL('/mcp', opts.publicUrl)
  const store = await GrantStore.open(opts.grantsPath)
  const provider = new LeashOAuthProvider({
    pairingCode: opts.pairingCode, store, resourceUrl,
  })

  const app = express()

  // Mounted at the root, as mcpAuthRouter requires. It serves discovery,
  // /authorize, /register, /token and /revoke, and validates S256 PKCE.
  app.use(mcpAuthRouter({
    provider,
    issuerUrl: opts.publicUrl,
    resourceServerUrl: resourceUrl,
    resourceName: 'Leash agent wallet',
  }))

  app.post(
    '/consent',
    express.urlencoded({ extended: false }),
    // A pairing code is 60 bits, but a bounded guess rate costs nothing and
    // this endpoint is the only door to the wallet.
    rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true }),
    async (req, res) => {
      const { request_id: requestId, pairing_code: pairingCode } = req.body as Record<string, string>
      try {
        // A failed consent renders a page instead of redirecting: the only
        // party who should learn the code was wrong is the person typing it.
        res.redirect(302, await provider.approve(requestId ?? '', pairingCode ?? ''))
      } catch (err) {
        res.status(400)
          .setHeader('content-type', 'text/html; charset=utf-8')
          .send(renderConsentError((err as Error).message))
      }
    },
  )

  const mcp = createLeashServer(opts.config)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
  await mcp.connect(transport)

  const guards: express.RequestHandler[] = []
  if (opts.anthropicOnly) {
    guards.push((req, res, next) => {
      if (isAnthropicIp(req.ip ?? '')) return next()
      // 403, not 401: a retry with better credentials cannot help.
      res.status(403).json({ error: 'forbidden_source' })
    })
  }

  app.post(
    '/mcp',
    ...guards,
    requireBearerAuth({
      verifier: provider,
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
    }),
    async (req, res) => { await transport.handleRequest(req, res) },
  )
  // GET opens the standalone SSE stream; DELETE ends a session. Both need the
  // same guard, and omitting them leaves the client unable to close cleanly.
  app.get('/mcp', ...guards, requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
  }), async (req, res) => { await transport.handleRequest(req, res) })
  app.delete('/mcp', ...guards, requireBearerAuth({
    verifier: provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
  }), async (req, res) => { await transport.handleRequest(req, res) })

  return app
}
```

Note on the body: `transport.handleRequest(req, res)` is called **without** a
parsed body, so no `express.json()` may be mounted on `/mcp` — the transport
reads the stream itself. `express.urlencoded` is scoped to `/consent` for the
same reason.

- [ ] **Step 5: Run the tests**

Run: `cd mcp && npx vitest run app anthropicIps`
Expected: PASS. If the whole-loop case fails on the `initialize` call, check
that no body parser is mounted on `/mcp`.

- [ ] **Step 6: Run everything and typecheck**

Run: `cd mcp && pnpm test && npx tsc --noEmit`
Expected: all passing, tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add mcp/src/http/app.ts mcp/src/http/anthropicIps.ts mcp/test/app.test.ts mcp/test/anthropicIps.test.ts
git commit -m "feat(mcp): serve MCP over HTTP behind the SDK's OAuth router"
```

---

### Task 7: The `--http` flag and startup banner

**Files:**
- Modify: `mcp/src/index.ts`, `mcp/src/config.ts`
- Test: `mcp/test/httpConfig.test.ts`

**Interfaces:**
- Consumes: `buildApp`, `HttpOptions` (Task 6); `newPairingCode` (Task 4).
- Produces: `loadHttpConfig(env, argv): HttpArgs | null` where
  ```ts
  export type HttpArgs = { port: number; host: string; publicUrl: URL; anthropicOnly: boolean; grantsPath: string }
  ```
  `null` means no `--http` was passed, i.e. stdio.

- [ ] **Step 1: Write the failing test**

`mcp/test/httpConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { loadHttpConfig } from '../src/config.js'

const PUBLIC = { LEASH_PUBLIC_URL: 'https://leash.example' } as NodeJS.ProcessEnv

describe('loadHttpConfig', () => {
  it('returns null with no --http, so the default stays stdio', () => {
    expect(loadHttpConfig({}, [])).toBeNull()
  })

  it('defaults the port to 8787 and the host to loopback', () => {
    const args = loadHttpConfig(PUBLIC, ['--http'])!
    expect(args.port).toBe(8787)
    // Loopback is what turns on the SDK's DNS-rebinding protection.
    expect(args.host).toBe('127.0.0.1')
  })

  it('takes a port from the flag', () => {
    expect(loadHttpConfig(PUBLIC, ['--http', '9000'])!.port).toBe(9000)
  })

  /**
   * Named, not inferred. The origin cannot be derived from inside the process,
   * and a guess produces discovery documents whose `resource` does not match
   * what the user typed — which fails as "couldn't reach the MCP server".
   */
  it('names LEASH_PUBLIC_URL when it is missing', () => {
    expect(() => loadHttpConfig({}, ['--http'])).toThrow(/LEASH_PUBLIC_URL/)
  })

  it('rejects a public URL that is not https', () => {
    expect(() => loadHttpConfig({ LEASH_PUBLIC_URL: 'http://leash.example' }, ['--http']))
      .toThrow(/https/)
  })

  /** A path here silently breaks the exact-match rule on `resource`. */
  it('rejects a public URL carrying a path', () => {
    expect(() => loadHttpConfig({ LEASH_PUBLIC_URL: 'https://leash.example/mcp' }, ['--http']))
      .toThrow(/path/)
  })

  it('defaults the grant file under the home directory', () => {
    expect(loadHttpConfig(PUBLIC, ['--http'])!.grantsPath)
      .toBe(join(homedir(), '.leash', 'grants.json'))
  })

  it('leaves the IP guard off unless asked', () => {
    expect(loadHttpConfig(PUBLIC, ['--http'])!.anthropicOnly).toBe(false)
    expect(loadHttpConfig(PUBLIC, ['--http', '--anthropic-only'])!.anthropicOnly).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd mcp && npx vitest run httpConfig`
Expected: FAIL — `loadHttpConfig` is not exported.

- [ ] **Step 3: Add `loadHttpConfig` to `mcp/src/config.ts`**

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'

export type HttpArgs = {
  port: number
  host: string
  publicUrl: URL
  anthropicOnly: boolean
  grantsPath: string
}

/**
 * Reads the http-mode arguments, or returns null for stdio.
 *
 * Every check fails at startup rather than at the first connection attempt.
 * A wrong LEASH_PUBLIC_URL does not fail loudly on its own: it produces
 * discovery documents whose `resource` disagrees with the URL the user typed
 * into Claude, and the only symptom is "couldn't reach the MCP server".
 */
export function loadHttpConfig(env: NodeJS.ProcessEnv, argv: string[]): HttpArgs | null {
  const flag = argv.indexOf('--http')
  if (flag === -1) return null

  const next = argv[flag + 1]
  const port = next !== undefined && /^\d+$/.test(next)
    ? Number(next)
    : Number(env.LEASH_HTTP_PORT ?? 8787)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${port} is not a usable port`)
  }

  const raw = env.LEASH_PUBLIC_URL
  if (!raw) {
    throw new Error(
      'LEASH_PUBLIC_URL is not set. In --http mode the server has to be told its own ' +
      'public https origin, because OAuth discovery has to quote it back exactly as ' +
      'the URL you paste into Claude. Start your tunnel first, then pass its origin.',
    )
  }
  let publicUrl: URL
  try {
    publicUrl = new URL(raw)
  } catch {
    throw new Error(`LEASH_PUBLIC_URL is not a URL: ${raw}`)
  }
  if (publicUrl.protocol !== 'https:') {
    throw new Error(`LEASH_PUBLIC_URL must be https, got ${publicUrl.protocol.replace(':', '')}`)
  }
  if (publicUrl.pathname !== '/' || publicUrl.search !== '' || publicUrl.hash !== '') {
    throw new Error(
      `LEASH_PUBLIC_URL must be a bare origin with no path, got ${raw}. ` +
      'The /mcp path is appended for you.',
    )
  }

  const hostFlag = argv.indexOf('--host')
  return {
    port,
    // Loopback by default: it is what enables the SDK's DNS-rebinding
    // protection, and a tunnel reaches it fine.
    host: hostFlag === -1 ? '127.0.0.1' : (argv[hostFlag + 1] ?? '127.0.0.1'),
    publicUrl,
    anthropicOnly: argv.includes('--anthropic-only'),
    grantsPath: env.LEASH_GRANTS_PATH ?? join(homedir(), '.leash', 'grants.json'),
  }
}
```

- [ ] **Step 4: Run the test**

Run: `cd mcp && npx vitest run httpConfig`
Expected: PASS, 8 tests.

- [ ] **Step 5: Rewrite `mcp/src/index.ts`**

```ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig, loadHttpConfig } from './config.js'
import { createLeashServer } from './server.js'

const config = loadConfig(process.env)
const http = loadHttpConfig(process.env, process.argv.slice(2))

if (http === null) {
  await createLeashServer(config).connect(new StdioServerTransport())
} else {
  // Imported lazily so the stdio path — the one every existing user is on —
  // does not pay to load express and the OAuth router.
  const [{ buildApp }, { newPairingCode }] = await Promise.all([
    import('./http/app.js'),
    import('./http/provider.js'),
  ])
  const pairingCode = newPairingCode()
  const app = await buildApp({
    config,
    publicUrl: http.publicUrl,
    pairingCode,
    grantsPath: http.grantsPath,
    anthropicOnly: http.anthropicOnly,
  })
  app.listen(http.port, http.host, () => {
    // stderr, never stdout: stdout is the JSON-RPC channel of the transport
    // this branch sits beside, and a banner there would corrupt it.
    process.stderr.write([
      `Leash MCP over HTTP on ${http.host}:${http.port}`,
      `Add this URL to Claude:  ${new URL('/mcp', http.publicUrl).href}`,
      `Pairing code:            ${pairingCode}`,
      '',
      'The pairing code authorises a NEW connection. Anyone who can read it can',
      'spend up to the caps your account enforces on-chain.',
      '',
    ].join('\n'))
  })
}
```

- [ ] **Step 6: Run everything, typecheck, and start it by hand**

Run: `cd mcp && pnpm test && npx tsc --noEmit`

Then a real start, which must print the banner and serve discovery:

```bash
cd mcp
set -a; source ../.env; set +a
LEASH_PUBLIC_URL=https://leash.example LEASH_GRANTS_PATH=/tmp/leash-grants.json \
  npx tsx src/index.ts --http 8787 &
sleep 2
curl -s localhost:8787/.well-known/oauth-authorization-server | head -20
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8787/mcp \
  -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
kill %1
```

Expected: metadata JSON quoting `https://leash.example`, and `401` from the
second call.

- [ ] **Step 7: Commit**

```bash
git add mcp/src/index.ts mcp/src/config.ts mcp/test/httpConfig.test.ts
git commit -m "feat(mcp): --http starts the server claude.ai can actually reach"
```

---

### Task 8: Prove it in the packed tarball

The published bin is what users run. Every other suite resolves `@leash/sdk` through the workspace symlink and cannot see a packaging failure.

**Files:**
- Modify: `mcp/test/bundle.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('the packed bundle', …)` in `mcp/test/bundle.test.ts`:

```ts
  /**
   * The http path imports express and the OAuth router lazily, which means a
   * packaging mistake there is invisible to every test that imports src/.
   * This is the same hazard `leash_fetch`'s dynamic import already guards.
   */
  it('starts in --http mode and serves OAuth discovery', async () => {
    const port = 8000 + Math.floor(Math.random() * 1000)
    const child = spawn('node', [binPath, '--http', String(port)], {
      env: {
        PATH: process.env.PATH!,
        ...ENV,
        LEASH_PUBLIC_URL: 'https://leash.example',
        LEASH_GRANTS_PATH: join(installDir, 'grants.json'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    let stdout = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    try {
      // Wait on the banner, not on a timer: a fixed sleep is a flaky test on
      // a loaded machine, and the banner is the condition that matters.
      const started = Date.now()
      while (!stderr.includes('Pairing code:')) {
        if (Date.now() - started > 20_000) throw new Error(`never started. stderr:\n${stderr}`)
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(stderr).toMatch(/Pairing code:\s+[0-9A-HJ-NP-Z]{4}-[0-9A-HJ-NP-Z]{4}-[0-9A-HJ-NP-Z]{4}/)
      // Nothing may reach stdout: it is the JSON-RPC channel in stdio mode,
      // and a banner there is a corrupt transport for every existing user.
      expect(stdout).toBe('')
      expect(stderr).not.toMatch(/Cannot find package|ERR_MODULE_NOT_FOUND/)

      const metadata = await fetch(
        `http://127.0.0.1:${port}/.well-known/oauth-authorization-server`,
      )
      expect(metadata.status).toBe(200)
      expect((await metadata.json()).issuer).toBe('https://leash.example')
    } finally {
      child.kill('SIGKILL')
    }
  }, 60_000)
```

Add `spawn` to the existing `node:child_process` import at the top of the file.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd mcp && pnpm test:bundle`
Expected: FAIL on the new case only — it builds against the current tarball.
(Minutes, not seconds.)

- [ ] **Step 3: Make it pass**

No source change should be needed. If it fails on a missing module, `express`
or `express-rate-limit` is being resolved from the workspace rather than from
the SDK's own tree — add it to `dependencies` in `mcp/package.json` and record
in the commit body that the SDK's transitive copy could not be relied on.

- [ ] **Step 4: Run the bundle suite**

Run: `cd mcp && pnpm test:bundle`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add mcp/test/bundle.test.ts
git commit -m "test(mcp): the http path's lazy imports were invisible to every suite that reads src/"
```

---

### Task 9: The wizard hands web users the wrong artifact

`app/`'s handoff ends with a `.mcp.json`. A web user has nowhere to put it.

**Files:**
- Create: `app/lib/webHandoff.ts`
- Modify: `app/components/McpHandoff.tsx`
- Test: `app/test/webHandoff.test.ts`

**Interfaces:**
- Consumes: `McpHandoff` type, `OPERATOR_PK_PLACEHOLDER`, `displayTag`, `FEE_ADAPTER` from `app/lib/mcpJson.ts`.
- Produces: `buildDotEnv(h: McpHandoff): string` and `buildRunCommands(): string`.

- [ ] **Step 1: Write the failing test**

`app/test/webHandoff.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildDotEnv, buildRunCommands } from '../lib/webHandoff.js'
import { OPERATOR_PK_PLACEHOLDER, ATTRIBUTION_TAG_PLACEHOLDER } from '../lib/mcpJson.js'

const handoff = {
  account: '0x7aDa926B021BAef4896F51F237bCA61435E43fd2',
  token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  feeAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  attributionTag: 'celo_3dec652cd977',
} as const

describe('buildDotEnv', () => {
  it('carries the same five variables the JSON block does', () => {
    const env = buildDotEnv(handoff)
    for (const key of [
      'LEASH_ACCOUNT', 'OPERATOR_PK', 'ATTRIBUTION_TAG', 'SPEND_TOKEN', 'FEE_ADAPTER',
    ]) expect(env).toContain(`${key}=`)
  })

  it('never emits a key, only the placeholder', () => {
    expect(buildDotEnv(handoff)).toContain(`OPERATOR_PK=${OPERATOR_PK_PLACEHOLDER}`)
  })

  /**
   * The same rule mcp/src/config.ts checks at startup. A tag the server
   * refuses must not reach the file looking configured — the identical bug
   * lib/mcpJson.ts's displayTag exists to prevent for the JSON block.
   */
  it('falls back to the placeholder on a tag the server would refuse', () => {
    expect(buildDotEnv({ ...handoff, attributionTag: 'celo_mytag' }))
      .toContain(`ATTRIBUTION_TAG=${ATTRIBUTION_TAG_PLACEHOLDER}`)
  })

  /** Unquoted, because `set -a; source .env` is how the docs say to load it. */
  it('emits bare KEY=value with no quotes or export', () => {
    expect(buildDotEnv(handoff)).not.toMatch(/export |"|'/)
  })
})

describe('buildRunCommands', () => {
  /**
   * The tunnel has to come first: LEASH_PUBLIC_URL is required at startup and
   * a trycloudflare URL is random per run. A block that reversed these two
   * would send every reader into a discovery mismatch.
   */
  it('starts the tunnel before the server', () => {
    const commands = buildRunCommands()
    expect(commands.indexOf('cloudflared')).toBeLessThan(commands.indexOf('leash-agentpay'))
  })

  it('passes LEASH_PUBLIC_URL and the --http flag', () => {
    expect(buildRunCommands()).toContain('LEASH_PUBLIC_URL=')
    expect(buildRunCommands()).toContain('--http')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd app && npx vitest run webHandoff`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/lib/webHandoff.ts`**

```ts
import { displayTag, FEE_ADAPTER, OPERATOR_PK_PLACEHOLDER, type McpHandoff } from './mcpJson.js'

/**
 * The same five values as the .mcp.json block, in the form a self-hosted
 * server reads them.
 *
 * claude.ai cannot spawn a process, so the JSON block has no destination
 * there — a web user needs environment and a command line instead. Unquoted
 * on purpose: the documented way to load it is `set -a; source .env; set +a`.
 */
export function buildDotEnv(h: McpHandoff): string {
  return [
    `LEASH_ACCOUNT=${h.account}`,
    `OPERATOR_PK=${OPERATOR_PK_PLACEHOLDER}`,
    `ATTRIBUTION_TAG=${displayTag(h.attributionTag)}`,
    `SPEND_TOKEN=${h.token}`,
    `FEE_ADAPTER=${FEE_ADAPTER}`,
    '',
  ].join('\n')
}

/**
 * The tunnel first, then the server.
 *
 * Not a stylistic ordering: `LEASH_PUBLIC_URL` is required at startup and a
 * trycloudflare URL is random per run, so a reader who starts the server
 * first has nothing to give it. Getting this backwards produces a discovery
 * mismatch whose only symptom is "couldn't reach the MCP server".
 */
export function buildRunCommands(): string {
  return [
    '# 1. Start the tunnel and copy the https URL it prints',
    'npx cloudflared tunnel --url http://localhost:8787',
    '',
    '# 2. In a second terminal, start Leash with that URL',
    'set -a; source .env; set +a',
    'LEASH_PUBLIC_URL=https://YOUR-TUNNEL-URL \\',
    '  npx -y leash-agentpay --http 8787',
    '',
  ].join('\n')
}
```

- [ ] **Step 4: Run the test**

Run: `cd app && npx vitest run webHandoff`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the tab to `app/components/McpHandoff.tsx`**

Add a two-button switch above the `<pre>`, defaulting to `code`. Keep the
existing block, copy button, tag field and warning exactly as they are for the
`code` surface; render the `.env`, the commands and the connector steps for
`web`. Use the existing `Panel`, `Label`, `Button` and the `.num` class, and
take colours from tokens (`var(--dim)`, `var(--bad)`, `var(--well)`,
`var(--line)`) — `docs/design-system.md` is asserted against `globals.css` by
tests that fail on drift.

```tsx
  const [surface, setSurface] = useState<'code' | 'web'>('code')
```

```tsx
        {/* Two surfaces, because the artifact differs: Claude Code and Desktop
            spawn a process and read JSON; claude.ai can only be given a URL. */}
        <div className="flex gap-2 mt-4">
          <Button
            variant={surface === 'code' ? 'primary' : 'secondary'}
            onClick={() => setSurface('code')}
          >
            Claude Code / Desktop
          </Button>
          <Button
            variant={surface === 'web' ? 'primary' : 'secondary'}
            onClick={() => setSurface('web')}
          >
            Claude web
          </Button>
        </div>
```

For `surface === 'web'`, render `buildDotEnv(...)` and `buildRunCommands()` in
`<pre className="num …">` blocks matching the existing one, then the steps:

```tsx
        <ol className="text-sm mt-4 pl-5" style={{ color: 'var(--dim)', listStyle: 'decimal' }}>
          <li>Save the block above as <code>.env</code>, with your operator key in it.</li>
          <li>Run the two commands. The tunnel must start first — the server needs its URL.</li>
          <li>Copy the <strong>pairing code</strong> the server prints to your terminal.</li>
          <li>In Claude: Settings → Connectors → Add custom connector.</li>
          <li>Paste <code>https://YOUR-TUNNEL-URL/mcp</code>. Leave Advanced settings empty.</li>
          <li>Press Connect, then paste the pairing code on the page that opens.</li>
          <li>Enable the connector in a chat and ask it to check your wallet.</li>
        </ol>
        <p className="text-sm mt-3" style={{ color: 'var(--bad)' }}>
          Your machine has to stay awake and the tunnel has to stay up, or the
          connector stops answering. A new tunnel URL means removing and re-adding
          the connector — the URL is part of what the connector authorises.
        </p>
```

Keep the operator-key warning visible on **both** surfaces; it is the one
sentence that must not be behind a tab.

- [ ] **Step 6: Run the app suites and typecheck**

Run: `cd app && pnpm test && npx tsc --noEmit`
Expected: 238 passing (232 existing + 6 new), tsc exit 0.

- [ ] **Step 7: Run the e2e suite, which builds and serves**

Run: `cd app && pnpm test:e2e`
Expected: 13 passing. If a spec asserts the handoff block's text, update the
spec to select the `code` surface explicitly rather than relying on the default.

- [ ] **Step 8: Commit**

```bash
git add app/lib/webHandoff.ts app/components/McpHandoff.tsx app/test/webHandoff.test.ts
git commit -m "fix(app): the wizard handed web users a file with nowhere to go"
```

---

### Task 10: Documentation

**Files:**
- Modify: `mcp/README.md`, `docs/mcp-setup.md`, `docs/RESUME.md`, `CLAUDE.md`

- [ ] **Step 1: Add a section to `docs/mcp-setup.md`**

After section 2 (the `.mcp.json` block), add **"3. Claude web, or any client that can only take a URL"**, covering: why the JSON block does not apply; the `.env`; the tunnel-then-server ordering and why; the pairing code and that it comes from stderr; the eight connector steps from the spec's §10; that a restart keeps the connection but a new tunnel URL does not; that the free plan allows one connector; and `--anthropic-only` as a recommended hardening with the reason it is not the default.

State plainly that the operator key now sits on a machine reachable from the
internet through a tunnel, and that the on-chain caps are what bound the loss.

- [ ] **Step 2: Add the same to `mcp/README.md`**

Shorter: the `--http` invocation, the pairing code, and a link to the setup
guide's new section. Keep the existing hot-key warning where it is.

- [ ] **Step 3: Update `docs/RESUME.md`**

Add the new suite counts to the status table, and a line saying the HTTP
transport exists and has or has not yet been connected from claude.ai for
real. **Do not write a ref hash** — that file records why.

- [ ] **Step 4: Add a line to `CLAUDE.md`'s commands block**

The test counts change. Update them, and add one bullet under the chain-facts
or conventions section recording that writes serialise through a mutex because
viem takes the nonce per send.

- [ ] **Step 5: Verify every count you wrote**

Run: `cd mcp && pnpm test && cd ../app && pnpm test`
Read the numbers off the output and fix any that disagree with what you typed.
CLAUDE.md's own history includes a count beside a directory that was wrong
twice; do not add a third.

- [ ] **Step 6: Commit**

```bash
git add mcp/README.md docs/mcp-setup.md docs/RESUME.md CLAUDE.md
git commit -m "docs: the setup guide had no path for a client that can only take a URL"
```

---

### Task 11: Connect it from claude.ai for real

Nothing here is testable in CI, and the spec names this as the larger half of the risk.

- [ ] **Step 1: Start the tunnel and the server**

```bash
cd mcp && pnpm run build
npx cloudflared tunnel --url http://localhost:8787
# second terminal:
set -a; source ../.env; set +a
LEASH_PUBLIC_URL=<the https URL cloudflared printed> node dist/index.js --http 8787
```

- [ ] **Step 2: Check discovery from outside**

```bash
curl -s https://<tunnel>/.well-known/oauth-protected-resource/mcp | jq
curl -si -X POST https://<tunnel>/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -5
```

Expected: `resource` exactly `https://<tunnel>/mcp`, and a `401` whose
`WWW-Authenticate` names the metadata URL. If the metadata 404s, discovery will
fail in the way Anthropic documents — the MCP server sees the first request and
the authorization server sees no traffic at all.

- [ ] **Step 3: Add the connector**

claude.ai → Settings → Connectors → Add custom connector →
`https://<tunnel>/mcp`, Advanced settings empty. Press Connect, paste the
pairing code.

- [ ] **Step 4: Call the cheapest tool**

In a chat with the connector enabled, ask it to check the wallet. `leash_status`
spends nothing, so a failure here costs no money.

- [ ] **Step 5: Prove the restart claim**

Kill the server, start it again with the **same** `LEASH_PUBLIC_URL`, and call
`leash_status` again. It must work without re-pairing — that is the whole
reason the grant file exists. If it asks to reconnect, the refresh path is
broken and Task 4's persistence test is passing for the wrong reason.

- [ ] **Step 6: Record what happened**

Write the outcome into `docs/deployments.md` in the style that file already
uses: what was proven, and how it was observed rather than assumed. If a real
payment was made, cite the transaction hash as `tx: 0x…` — `check-secrets.sh`
only allows a 64-hex value when labelled within 10 characters.

- [ ] **Step 7: Commit**

```bash
git add docs/deployments.md docs/RESUME.md
git commit -m "docs: claude.ai connected to a self-hosted Leash server on mainnet"
```

---

## Self-Review

**Spec coverage.** §1–2 → Tasks 1, 7. §3 (auth constraints) → Tasks 4, 5, 6.
§3.1 (no new dependency) → Global Constraints, verified by Task 8. §4
(architecture) → Tasks 1–7. §5 (config) and §5.1 (tunnel ordering) → Task 7,
and the ordering is asserted in Task 9's `buildRunCommands` test. §6 (consent
flow) → Tasks 4, 5, 6. §6.1 (stderr, pairing code) → Tasks 4, 7, and asserted
against the packed bin in Task 8. §6.2 (URL is not a credential) → Task 10's
docs. §7 (persistence) → Task 3. §8 (nonce, stderr) → Task 2 and Task 8. §9
(error paths) → Task 6's 401 tests. §10 (wizard artifact) → Task 9. §11
(testing) → every task. §13 (risks) → Task 11.

**Naming consistency.** `createLeashServer`, `Mutex.run`, `GrantStore.open`,
`hashToken`, `takeGrant`, `LeashOAuthProvider`, `newPairingCode`,
`provider.approve`, `renderConsent`, `renderConsentError`, `buildApp`,
`HttpOptions`, `isAnthropicIp`, `loadHttpConfig`, `HttpArgs`, `buildDotEnv`,
`buildRunCommands` — each defined once and referenced under that exact name.

**Known ordering dependency.** Task 4 imports `renderConsent` from Task 5. If
executing strictly in order, create `mcp/src/http/consent.ts` with the real
implementation during Task 4's Step 3 rather than stubbing it, and let Task 5
add only its tests and `renderConsentError`.

**Deliberately not covered by an automated test:** the IP guard's behaviour end
to end (Task 6 tests `isAnthropicIp` as a unit and leaves the middleware to
Task 11's manual pass), and everything in Task 11, which needs a real tunnel and
a real Claude account.
