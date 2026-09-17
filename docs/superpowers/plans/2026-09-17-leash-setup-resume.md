# Resuming an Interrupted Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/setup` never offers a second deployment while one it sent is still unresolved. It finds accounts the wallet already owns when this browser has none saved, and it recovers an authorised agent that this browser was not told about.

**Architecture:** Each decision is a pure or dependency-injected function in `app/lib/`, tested in the node environment with fakes. `/setup` and `AccountsPage` only call these functions. One new server route asks the explorer for `OperatorChanged` logs. Source ratchets keep the component wiring in place.

**Tech Stack:** Next.js App Router, wagmi 2.19, viem, vitest (node environment), Playwright, Etherscan v2 API.

**Spec:** `docs/superpowers/specs/2026-09-17-leash-setup-resume-design.md`

## Global Constraints

- No new dependency, and no component-testing library. `app/vitest.config.ts` stays `environment: 'node'`.
- Never run `test:gate` in `sdk` or `mcp`. It spends real money on mainnet.
- Reads that belong together go in one `Promise.all`, so viem can multicall them.
- Every write keeps its explicit `chainId: REQUIRED_CHAIN_ID` and explicit `gas`.
- Never report a write as anything other than what was observed.
- `app/test/scaleUsage.test.ts` caps raw Tailwind type classes per file. New text uses `PROSE`, or `--t-*` tokens in `style`, never `text-sm`/`text-xs`.
- In `app/app/setup/page.tsx`, a new effect ending in `}, [connected])` goes **after** the `connectedRef` effect. `agentKey.test.ts` finds the connected-wallet effect by the first occurrence of that text.
- Never write a bare 0x-prefixed 64-hex literal in code, tests or docs: `scripts/check-secrets.sh` blocks it as a possible private key. Compute it (`toEventSelector`, `'ab'.repeat(32)`), or label a real transaction hash `tx: 0x…` within 10 characters.
- Storage goes through `readLocal`/`writeLocal`/`removeLocal` from `app/lib/browserStorage.ts`. The one exception is registry calls, which take `localStorage`; wrap those in `try`.
- Comments explain *why*. Keep existing hazard comments when you edit nearby code.
- Commit subjects describe the defect in plain English. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Run commands from the repo root `/Users/vanhuy/Desktop/celo`. Paths are relative to it.
- If port 3000 is already in use, run e2e as `LEASH_E2E_URL=http://localhost:3000 pnpm -F @leash/app test:e2e`.

---

### Task 1: A deployment this browser sent is checked before another is offered (spec §2.2)

**Files:**
- Create: `app/lib/pendingDeploy.ts`
- Create: `app/test/pendingDeploy.test.ts`
- Modify: `app/app/setup/page.tsx` (imports; state near `restoreNote`; new functions and effect after the `connectedRef` effect; `deploy()`; step 1's no-account branch)

**Interfaces:**
- Produces:
  - `type PendingDeploy = { hash: \`0x${string}\`; owner: string; sentAt: number }`
  - `pendingDeployKey(owner: string): string`
  - `serializePendingDeploy(record: PendingDeploy): string`
  - `parsePendingDeploy(raw: string | null, owner: string): PendingDeploy | null`
  - `type PendingDeployCheck` (`landed` | `failed` | `waiting` | `unknown` | `unread`)
  - `type PendingDeployClient`
  - `checkPendingDeploy(hash, client): Promise<PendingDeployCheck>`
  - `pendingDeployNote(check: PendingDeployCheck | 'checking', hash): string | null`
  - `pendingDeployBlocksCreate(check: PendingDeployCheck | 'checking'): boolean`
- Produces in `setup/page.tsx` (Task 2 edits next to these): state `pendingDeploy`; the Create button's `disabled` expression containing `pendingDeployBlocksCreate(pendingDeploy.check)`

- [x] **Step 1: Write the failing tests**

Create `app/test/pendingDeploy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TransactionNotFoundError, TransactionReceiptNotFoundError } from 'viem'
import {
  checkPendingDeploy, parsePendingDeploy, pendingDeployBlocksCreate, pendingDeployKey,
  pendingDeployNote, serializePendingDeploy, type PendingDeployClient,
} from '../lib/pendingDeploy.js'

const OWNER = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
const OTHER = '0x64Ad61211C1b0B7f20B3e04B49661f30f152ae78'
const HASH = `0x${'ab'.repeat(32)}` as `0x${string}`
const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d' as const

/** Defaults to "Celo has never heard of it"; each test overrides what it needs. */
function client(over: Partial<PendingDeployClient> = {}): PendingDeployClient {
  return {
    getTransactionReceipt: async () => { throw new TransactionReceiptNotFoundError({ hash: HASH }) },
    getTransaction: async () => { throw new TransactionNotFoundError({ hash: HASH }) },
    ...over,
  }
}

describe('the pending deploy record', () => {
  it('is keyed by owner, whatever the casing', () => {
    expect(pendingDeployKey(OWNER)).toBe(`leash.pendingDeploy.${OWNER.toLowerCase()}`)
  })

  it('round-trips', () => {
    const record = { hash: HASH, owner: OWNER, sentAt: 1 }
    expect(parsePendingDeploy(serializePendingDeploy(record), OWNER.toLowerCase())).toEqual(record)
  })

  it('refuses anything it did not write for this owner', () => {
    expect(parsePendingDeploy(null, OWNER)).toBeNull()
    expect(parsePendingDeploy('not json', OWNER)).toBeNull()
    expect(parsePendingDeploy(JSON.stringify({ hash: '0x12', owner: OWNER, sentAt: 1 }), OWNER)).toBeNull()
    expect(parsePendingDeploy(JSON.stringify({ hash: HASH, owner: OTHER, sentAt: 1 }), OWNER)).toBeNull()
    expect(parsePendingDeploy(JSON.stringify({ hash: HASH, owner: OWNER }), OWNER)).toBeNull()
  })
})

describe('checkPendingDeploy', () => {
  it('reports a landed deployment with its address and block', async () => {
    const check = await checkPendingDeploy(HASH, client({
      getTransactionReceipt: async () => ({ status: 'success', contractAddress: ACCOUNT, blockNumber: 123n }),
    }))
    expect(check).toEqual({ kind: 'landed', address: ACCOUNT, deployBlock: '123' })
  })

  // A receipt is not a success: describeDeployReceipt decides, as deploy() does.
  it('reports a reverted deployment as failed, in describeDeployReceipt words', async () => {
    const check = await checkPendingDeploy(HASH, client({
      getTransactionReceipt: async () => ({ status: 'reverted', contractAddress: ACCOUNT, blockNumber: 5n }),
    }))
    expect(check.kind).toBe('failed')
    expect(check.kind === 'failed' && check.message).toContain('reverted')
  })

  it('is waiting when the node knows the transaction but has no receipt', async () => {
    const check = await checkPendingDeploy(HASH, client({ getTransaction: async () => ({}) }))
    expect(check).toEqual({ kind: 'waiting' })
  })

  it('is unknown when the node knows neither', async () => {
    expect(await checkPendingDeploy(HASH, client())).toEqual({ kind: 'unknown' })
  })

  // An unreachable node is not evidence about the transaction either way.
  it('is unread on any other failure', async () => {
    expect(await checkPendingDeploy(HASH, client({
      getTransactionReceipt: async () => { throw new Error('fetch failed') },
    }))).toEqual({ kind: 'unread' })
    expect(await checkPendingDeploy(HASH, client({
      getTransaction: async () => { throw new Error('fetch failed') },
    }))).toEqual({ kind: 'unread' })
  })

  it('recognises a not-found error wrapped in a cause', async () => {
    const check = await checkPendingDeploy(HASH, client({
      getTransactionReceipt: async () => {
        throw Object.assign(new Error('wrapped'), { cause: new TransactionReceiptNotFoundError({ hash: HASH }) })
      },
      getTransaction: async () => ({}),
    }))
    expect(check).toEqual({ kind: 'waiting' })
  })
})

describe('what the wizard says and allows', () => {
  it('names the transaction in every unresolved state', () => {
    for (const check of ['checking', { kind: 'waiting' }, { kind: 'unknown' }, { kind: 'unread' }] as const) {
      expect(pendingDeployNote(check, HASH)).toContain(HASH)
    }
  })

  it('has nothing to say once it landed, and passes a failure through', () => {
    expect(pendingDeployNote({ kind: 'landed', address: ACCOUNT, deployBlock: '1' }, HASH)).toBeNull()
    expect(pendingDeployNote({ kind: 'failed', message: 'boom' }, HASH)).toBe('boom')
  })

  // A second press is a second fee: every state short of an answer blocks it.
  it('blocks Create until the chain has answered', () => {
    expect(pendingDeployBlocksCreate('checking')).toBe(true)
    expect(pendingDeployBlocksCreate({ kind: 'waiting' })).toBe(true)
    expect(pendingDeployBlocksCreate({ kind: 'unread' })).toBe(true)
    expect(pendingDeployBlocksCreate({ kind: 'unknown' })).toBe(true)
    expect(pendingDeployBlocksCreate({ kind: 'failed', message: 'x' })).toBe(false)
    expect(pendingDeployBlocksCreate({ kind: 'landed', address: ACCOUNT, deployBlock: '1' })).toBe(false)
  })
})

describe('the wizard remembers what it sent', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')
  const deploy = source.slice(source.indexOf('async function deploy()'), source.indexOf('async function setLimits()'))

  it('records the hash before waiting for the receipt', () => {
    const at = deploy.indexOf('writeLocal(pendingDeployKey(owner)')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(deploy.indexOf('waitForTransactionReceipt'))
  })

  it('forgets it once the receipt has been judged, either way', () => {
    const at = deploy.indexOf('removeLocal(pendingDeployKey(owner))')
    expect(at).toBeGreaterThan(deploy.indexOf('describeDeployReceipt(receipt, hash)'))
    expect(at).toBeLessThan(deploy.indexOf('if (!outcome.ok)'))
  })

  it('checks a remembered deployment when a wallet connects', () => {
    expect(source).toContain('parsePendingDeploy(readLocal(pendingDeployKey(connected)), connected)')
  })

  it('does not offer Create while one is unresolved', () => {
    const create = source.slice(source.indexOf('onClick={() => void deploy()}') - 300, source.indexOf('onClick={() => void deploy()}'))
    expect(create).toContain('pendingDeployBlocksCreate(pendingDeploy.check)')
  })

  it('lets the owner past a deployment Celo does not know, in two beats', () => {
    expect(source).toContain('It never landed — deploy again')
    expect(source).toContain('abandonArmed ? abandonPendingDeploy(')
  })
})
```

- [x] **Step 2: Run the tests and confirm they fail**

Run: `pnpm -F @leash/app test -- pendingDeploy`
Expected: FAIL with `Failed to resolve import "../lib/pendingDeploy.js"`.

- [x] **Step 3: Implement `app/lib/pendingDeploy.ts`**

```ts
import { describeDeployReceipt } from './deploy.js'

/**
 * A deployment this browser sent and has not yet seen judged.
 *
 * deploy() used to save an account only after its receipt. A tab closed
 * during the wait -- the longest wait in the app -- left a real contract that
 * nothing remembered, and the next visit offered "Create protected account"
 * again: a second contract, and a second fee. The hash is written the moment
 * the wallet returns it, and a returning wallet asks Celo about it before step
 * 1 offers anything.
 */
export type PendingDeploy = { hash: `0x${string}`; owner: string; sentAt: number }

export function pendingDeployKey(owner: string): string {
  return `leash.pendingDeploy.${owner.toLowerCase()}`
}

export function serializePendingDeploy(record: PendingDeploy): string {
  return JSON.stringify(record)
}

/** Null for anything malformed, and for a record another owner wrote. */
export function parsePendingDeploy(raw: string | null, owner: string): PendingDeploy | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PendingDeploy>
    if (typeof value.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value.hash)) return null
    if (typeof value.owner !== 'string' || value.owner.toLowerCase() !== owner.toLowerCase()) return null
    if (typeof value.sentAt !== 'number') return null
    return { hash: value.hash as `0x${string}`, owner: value.owner, sentAt: value.sentAt }
  } catch {
    return null
  }
}

export type PendingDeployCheck =
  | { kind: 'landed'; address: `0x${string}`; deployBlock: string }
  | { kind: 'failed'; message: string }
  /** The node knows the transaction; there is no receipt yet. */
  | { kind: 'waiting' }
  /**
   * The node knows neither. Not proof it was dropped: forno is load-balanced,
   * and one node may not have seen what another accepted. Only the owner may
   * decide to move past it.
   */
  | { kind: 'unknown' }
  /** The node did not answer. Says nothing about the transaction. */
  | { kind: 'unread' }

type DeployReceipt = {
  status: 'success' | 'reverted'
  contractAddress?: `0x${string}` | null
  blockNumber: bigint
}

/** Injected, so the decision can be tested without a node. */
export type PendingDeployClient = {
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<DeployReceipt>
  getTransaction(args: { hash: `0x${string}` }): Promise<unknown>
}

function isNamed(error: unknown, name: string): boolean {
  let link: unknown = error
  for (let depth = 0; depth < 5 && link && typeof link === 'object'; depth++) {
    if ((link as { name?: unknown }).name === name) return true
    link = (link as { cause?: unknown }).cause
  }
  return false
}

export async function checkPendingDeploy(
  hash: `0x${string}`,
  client: PendingDeployClient,
): Promise<PendingDeployCheck> {
  try {
    const receipt = await client.getTransactionReceipt({ hash })
    // describeDeployReceipt, not receipt.status alone: a reverted creation
    // still carries a contractAddress. deploy() judges it the same way.
    const outcome = describeDeployReceipt(receipt, hash)
    return outcome.ok
      ? { kind: 'landed', address: outcome.address, deployBlock: receipt.blockNumber.toString() }
      : { kind: 'failed', message: outcome.message }
  } catch (error) {
    if (!isNamed(error, 'TransactionReceiptNotFoundError')) return { kind: 'unread' }
  }
  try {
    await client.getTransaction({ hash })
    return { kind: 'waiting' }
  } catch (error) {
    return isNamed(error, 'TransactionNotFoundError') ? { kind: 'unknown' } : { kind: 'unread' }
  }
}

export function pendingDeployNote(
  check: PendingDeployCheck | 'checking',
  hash: `0x${string}`,
): string | null {
  if (check === 'checking') return `Checking the deployment this browser sent earlier (${hash})…`
  switch (check.kind) {
    case 'landed': return null
    case 'failed': return check.message
    case 'waiting':
      return `A deployment sent from this browser (${hash}) has not confirmed yet. Wait for it before creating another account.`
    case 'unknown':
      return `Celo does not know the deployment this browser sent earlier (${hash}). It may have been dropped. Check it on the explorer; if it never landed, you can deploy again.`
    case 'unread':
      return `Could not check the deployment this browser sent earlier (${hash}). Try again in a moment.`
  }
}

/** Every state short of an answer from the chain keeps Create shut. */
export function pendingDeployBlocksCreate(check: PendingDeployCheck | 'checking'): boolean {
  if (check === 'checking') return true
  return check.kind !== 'landed' && check.kind !== 'failed'
}
```

- [x] **Step 4: Run the unit tests**

Run: `pnpm -F @leash/app test -- pendingDeploy`
Expected: every test in the first three `describe` blocks PASSES. The `the wizard remembers what it sent` block still FAILS; Step 5 fixes it.

- [x] **Step 5: Wire it into `/setup`**

In `app/app/setup/page.tsx`:

1. Change the imports so they read:
   ```ts
   import { canEdit, formatDisplayAmount, parseAmount, validateLimits } from '../../lib/policy.js'
   ```
   ```ts
   import { readLocal, removeLocal, writeLocal } from '../../lib/browserStorage.js'
   ```
   and add:
   ```ts
   import { useArming } from '../../lib/arming.js'
   import {
     checkPendingDeploy, parsePendingDeploy, pendingDeployBlocksCreate, pendingDeployKey, pendingDeployNote,
     serializePendingDeploy, type PendingDeploy, type PendingDeployCheck,
   } from '../../lib/pendingDeploy.js'
   ```
2. Directly below `const [restoreNote, setRestoreNote] = useState<string | null>(null)`, add:
   ```ts
     /** A deployment this browser sent and has not seen judged. lib/pendingDeploy.ts. */
     const [pendingDeploy, setPendingDeploy] =
       useState<{ record: PendingDeploy; check: PendingDeployCheck | 'checking' } | null>(null)
     const { armed: abandonArmed, arm: armAbandon, disarm: disarmAbandon } = useArming()
   ```
3. Directly below the line `useEffect(() => { connectedRef.current = connected }, [connected])`, add:
   ```ts
     async function resolvePendingDeploy(record: PendingDeploy) {
       setPendingDeploy({ record, check: 'checking' })
       const check = await checkPendingDeploy(record.hash, {
         getTransactionReceipt: (args) => publicClient.getTransactionReceipt(args),
         getTransaction: (args) => publicClient.getTransaction(args),
       })
       // The wallet changed while Celo was being asked. This answer is about
       // another owner's deployment, and that owner gets it on their own visit.
       if (!canEdit(record.owner, connectedRef.current)) return
       if (check.kind === 'landed') {
         try {
           savePolicyAccount(localStorage, record.owner, { address: check.address, deployBlock: check.deployBlock })
           selectPolicyAccount(localStorage, record.owner, check.address)
         } catch { /* the chain is the record; see lib/browserStorage.ts */ }
         announceAccountRegistryChange()
         removeLocal(pendingDeployKey(record.owner))
         setPendingDeploy(null)
         setAccount(check.address)
         return
       }
       if (check.kind === 'failed') {
         removeLocal(pendingDeployKey(record.owner))
         setPendingDeploy(null)
         setError(check.message)
         return
       }
       setPendingDeploy({ record, check })
     }

     /** Only offered for `unknown`, and only after a second press. */
     function abandonPendingDeploy(record: PendingDeploy) {
       disarmAbandon()
       removeLocal(pendingDeployKey(record.owner))
       setPendingDeploy(null)
       void deploy()
     }

     // Asked before step 1 offers anything: an unconfirmed deployment is a
     // real contract, and a second press is a second fee.
     useEffect(() => {
       setPendingDeploy(null)
       if (!connected) return
       const record = parsePendingDeploy(readLocal(pendingDeployKey(connected)), connected)
       if (record) void resolvePendingDeploy(record)
     }, [connected])
   ```
4. In `deploy()`, directly after the inner `try { hash = await deployContractAsync(...) } catch { ... }` block and before `setDeployPhase('confirming')`, add:
   ```ts
         // Remembered before the wait, not after: the wait is where a closed
         // tab used to lose a real contract, and the next press paid for another.
         const record: PendingDeploy = { hash, owner, sentAt: Date.now() }
         writeLocal(pendingDeployKey(owner), serializePendingDeploy(record))
   ```
5. In `deploy()`, directly after `const outcome = describeDeployReceipt(receipt, hash)`, add:
   ```ts
           // Judged, either way. Nothing is pending any more.
           removeLocal(pendingDeployKey(owner))
   ```
6. In `deploy()`, replace
   ```ts
         } catch {
           setError(`Sent as ${hash}. The chain has not confirmed it yet. Check that transaction before deploying again.`)
         }
   ```
   with
   ```ts
         } catch {
           // Still pending as far as anyone knows. The record stays, so a
           // reload asks again; the same wallet sees the panel that says so now.
           if (canEdit(owner, connectedRef.current)) setPendingDeploy({ record, check: { kind: 'waiting' } })
           else setError(`Sent as ${hash}. The chain has not confirmed it yet. Check that transaction before deploying again.`)
         }
   ```
7. In step 1's no-account branch, replace
   ```tsx
                   <Button variant="primary" className="mt-3" disabled={deploying || restoring} onClick={() => void deploy()}>
   ```
   with
   ```tsx
                   {pendingDeploy && (
                     <div role="status" className="mt-4">
                       <p style={{ ...PROSE, color: 'var(--dim)' }}>
                         {pendingDeployNote(pendingDeploy.check, pendingDeploy.record.hash)}
                       </p>
                       <div className="mt-3 flex flex-wrap gap-2">
                         <Button
                           disabled={pendingDeploy.check === 'checking'}
                           onClick={() => void resolvePendingDeploy(pendingDeploy.record)}
                         >
                           Check again
                         </Button>
                         {pendingDeploy.check !== 'checking' && pendingDeploy.check.kind === 'unknown' && (
                           <Button
                             variant="stop"
                             onClick={() => (abandonArmed ? abandonPendingDeploy(pendingDeploy.record) : armAbandon(true))}
                           >
                             {abandonArmed ? 'Confirm: deploy again' : 'It never landed — deploy again'}
                           </Button>
                         )}
                       </div>
                     </div>
                   )}
                   <Button
                     variant="primary"
                     className="mt-3"
                     disabled={deploying || restoring
                       || (pendingDeploy !== null && pendingDeployBlocksCreate(pendingDeploy.check))}
                     onClick={() => void deploy()}
                   >
   ```
   Leave the button's children (`writeLabel(deployPhase, …)`) and its closing tag unchanged.

- [x] **Step 6: Run the tests and typecheck**

Run: `pnpm -F @leash/app test && (cd app && npx tsc --noEmit)`
Expected: every test PASSES, including the existing `agentKey`, `setup` and `scaleUsage` ratchets. tsc prints nothing.

- [x] **Step 7: Commit**

```bash
git add app/lib/pendingDeploy.ts app/test/pendingDeploy.test.ts app/app/setup/page.tsx
git commit -m "fix(app): closing the tab mid-deploy let the next visit pay for a second account" -m "deploy() saved an account only after its receipt, so a tab closed during the wait left a real contract nothing remembered, and /setup offered Create protected account again. The hash is now stored as soon as the wallet returns it and cleared once the receipt is judged. A returning wallet asks Celo about it first: a landed deployment is resumed, a failed one is reported, and anything unresolved keeps Create shut, with a two-beat way past a transaction Celo does not know.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `/setup` looks up accounts the wallet already owns (spec §2.3)

**Files:**
- Create: `app/lib/ownedAccounts.ts`
- Create: `app/test/ownedAccounts.test.ts`
- Modify: `app/components/AccountsPage.tsx` (remove the verification it owns; `discoverAccounts` calls `findOwnedAccounts`)
- Modify: `app/test/accountDiscovery.test.ts` (replace one ratchet)
- Modify: `app/app/setup/page.tsx` (imports; state; new effect after Task 1's effect; step 1; status line)
- Modify: `app/test/setup.test.ts` (append)

**Interfaces:**
- Consumes:
  - `DiscoveredAccountCandidate` from `app/lib/accountDiscovery.ts`
  - `publicClient` from `app/lib/chain.ts`
  - Task 1's Create `disabled` expression in `setup/page.tsx`
- Produces:
  - `type Verification = 'verified' | 'wrong-owner' | 'incompatible' | 'unreadable'`
  - `verifyPolicyAccount(address, expectedOwner): Promise<Verification>`
  - `answeredByTheContract(error): boolean`
  - `type OwnedAccountsResult`
  - `findOwnedAccounts(owner, signal, deps?): Promise<OwnedAccountsResult>`
  - `newestAccount(list): DiscoveredAccountCandidate | null`
  - `LOOKUP_UNCERTAIN`
  - `accountLookupNote(result): string | null`

- [x] **Step 1: Write the failing tests**

Create `app/test/ownedAccounts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LOOKUP_UNCERTAIN, accountLookupNote, findOwnedAccounts, newestAccount,
  type OwnedAccountsResult, type Verification,
} from '../lib/ownedAccounts.js'

const OWNER = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57' as const
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as `0x${string}`
const candidates = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ address: addr(i + 1), deployBlock: String(i + 1) }))

function ok(accounts: ReturnType<typeof candidates>, historyTruncated = false) {
  return async () => ({ ok: true, body: { accounts, historyTruncated } })
}

describe('findOwnedAccounts', () => {
  it('keeps only verified accounts, and counts the ones Celo did not answer for', async () => {
    const verdicts: Verification[] = ['verified', 'unreadable', 'wrong-owner', 'incompatible', 'verified']
    const result = await findOwnedAccounts(OWNER, new AbortController().signal, {
      fetchCandidates: ok(candidates(5), true),
      verify: async (address) => verdicts[Number(BigInt(address)) - 1],
    })
    expect(result).toEqual({
      status: 'ok',
      verified: [candidates(5)[0], candidates(5)[4]],
      unreadable: 1,
      historyTruncated: true,
    })
  })

  // The AccountsPage defect of 2026-09-17, now held by behaviour rather than
  // by a source ratchet: a run replaced while its response was read must not
  // report anything about the owner it was started for.
  it('stops when replaced after the response arrives', async () => {
    const controller = new AbortController()
    let verified = 0
    const result = await findOwnedAccounts(OWNER, controller.signal, {
      fetchCandidates: async () => { controller.abort(); return { ok: false, body: {} } },
      verify: async () => { verified++; return 'verified' },
    })
    expect(result).toEqual({ status: 'aborted' })
    expect(verified).toBe(0)
  })

  it('stops between batches of five', async () => {
    const controller = new AbortController()
    let calls = 0
    const result = await findOwnedAccounts(OWNER, controller.signal, {
      fetchCandidates: ok(candidates(7)),
      verify: async () => { calls++; controller.abort(); return 'verified' },
    })
    expect(result).toEqual({ status: 'aborted' })
    expect(calls).toBe(5)
  })

  it('tells a cancelled request from a failed one', async () => {
    const controller = new AbortController()
    controller.abort()
    const reject = async () => { throw new Error('network') }
    expect(await findOwnedAccounts(OWNER, controller.signal, { fetchCandidates: reject }))
      .toEqual({ status: 'aborted' })
    expect(await findOwnedAccounts(OWNER, new AbortController().signal, { fetchCandidates: reject }))
      .toEqual({ status: 'failed' })
  })

  it('names an unconfigured explorer, and fails on any other bad response', async () => {
    const signal = new AbortController().signal
    expect(await findOwnedAccounts(OWNER, signal, {
      fetchCandidates: async () => ({ ok: false, body: { code: 'DISCOVERY_NOT_CONFIGURED' } }),
    })).toEqual({ status: 'not-configured' })
    expect(await findOwnedAccounts(OWNER, signal, {
      fetchCandidates: async () => ({ ok: false, body: {} }),
    })).toEqual({ status: 'failed' })
    expect(await findOwnedAccounts(OWNER, signal, {
      fetchCandidates: async () => ({ ok: true, body: {} }),
    })).toEqual({ status: 'failed' })
  })
})

describe('newestAccount', () => {
  // Compared as numbers: '9' sorts after '10' as a string.
  it('picks the highest deploy block', () => {
    expect(newestAccount([
      { address: addr(1), deployBlock: '9' },
      { address: addr(2), deployBlock: '10' },
    ])).toEqual({ address: addr(2), deployBlock: '10' })
  })

  it('has nothing to pick from an empty list', () => {
    expect(newestAccount([])).toBeNull()
  })
})

describe('accountLookupNote', () => {
  const found = (n: number, extra: Partial<Extract<OwnedAccountsResult, { status: 'ok' }>> = {}) =>
    ({ status: 'ok', verified: candidates(n), unreadable: 0, historyTruncated: false, ...extra }) as const

  it('says nothing when the answer is clear', () => {
    expect(accountLookupNote(found(0))).toBeNull()
    expect(accountLookupNote(found(1))).toBeNull()
    expect(accountLookupNote({ status: 'aborted' })).toBeNull()
  })

  it('says which of several it resumed', () => {
    expect(accountLookupNote(found(3))).toBe(
      'This wallet owns 3 protected accounts. Resumed the newest; open My accounts to choose another.',
    )
  })

  // "None" built from a read that did not happen is a claim this app refuses.
  it('will not imply there is none when it could not tell', () => {
    expect(accountLookupNote(found(0, { unreadable: 2 }))).toBe(LOOKUP_UNCERTAIN)
    expect(accountLookupNote(found(0, { historyTruncated: true }))).toBe(LOOKUP_UNCERTAIN)
    expect(accountLookupNote({ status: 'failed' })).toBe(LOOKUP_UNCERTAIN)
    expect(accountLookupNote({ status: 'not-configured' })).toBe(LOOKUP_UNCERTAIN)
  })
})

describe('one implementation of account discovery', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))

  it('AccountsPage uses findOwnedAccounts and no verifier of its own', () => {
    const source = readFileSync(join(ROOT, 'components/AccountsPage.tsx'), 'utf8')
    expect(source).toContain('findOwnedAccounts(owner, signal)')
    expect(source).not.toContain('function verifyPolicyAccount')
    expect(source).not.toContain('function answeredByTheContract')
  })
})
```

In `app/test/accountDiscovery.test.ts`, delete the test `it('check for replacement before reporting a failed response', …)` and its body. `ownedAccounts.test.ts` now covers that behaviour.

Append to `app/test/setup.test.ts`:

```ts
/**
 * A wallet this browser has never seen may own an account already: another
 * device, cleared site data, a tab closed mid-deploy. /setup used to show step
 * 1 regardless, and a second account is a second deployment fee.
 */
describe('the wizard looks for accounts it was not told about', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')
  const start = source.indexOf('// A wallet this browser has never seen')
  const effect = source.slice(start, source.indexOf('}, [connected])', start))

  it('runs the shared lookup, cancellably, only when nothing is saved and no new account was asked for', () => {
    expect(start).toBeGreaterThan(-1)
    expect(effect).toContain('findOwnedAccounts(connected, controller.signal)')
    expect(effect).toContain('return () => controller.abort()')
    expect(effect).toContain("get('new') === '1'")
    expect(effect).toContain('listPolicyAccounts(localStorage, connected)')
  })

  it('does not offer Create while it is looking', () => {
    const at = source.indexOf('onClick={() => void deploy()}')
    expect(source.slice(at - 300, at)).toContain("lookup === 'searching'")
  })
})
```

- [x] **Step 2: Run the tests and confirm they fail**

Run: `pnpm -F @leash/app test -- ownedAccounts setup.test`
Expected: FAIL. `../lib/ownedAccounts.js` cannot be resolved, and the new setup ratchets do not match.

- [x] **Step 3: Implement `app/lib/ownedAccounts.ts`**

Move `TOKEN`, `VERIFY_ABI`, `answeredByTheContract` and `verifyPolicyAccount` out of `app/components/AccountsPage.tsx` into this file **unchanged, with their doc comments**, and export the two functions. Give `verifyPolicyAccount` the return type `Promise<Verification>`. Then add the rest, so the file reads:

```ts
import {
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type BaseError,
} from 'viem'
import { publicClient } from './chain.js'
import type { DiscoveredAccountCandidate } from './accountDiscovery.js'

// ---- moved verbatim from components/AccountsPage.tsx: TOKEN, VERIFY_ABI ----

export type Verification = 'verified' | 'wrong-owner' | 'incompatible' | 'unreadable'

// ---- moved verbatim, now exported: answeredByTheContract, verifyPolicyAccount ----

export type OwnedAccountsResult =
  | { status: 'aborted' }
  | { status: 'not-configured' }
  | { status: 'failed' }
  | {
      status: 'ok'
      verified: DiscoveredAccountCandidate[]
      unreadable: number
      historyTruncated: boolean
    }

type DiscoverBody = {
  accounts?: DiscoveredAccountCandidate[]
  historyTruncated?: boolean
  code?: string
}

type Deps = {
  fetchCandidates?: (owner: `0x${string}`, signal: AbortSignal) => Promise<{ ok: boolean; body: DiscoverBody }>
  verify?: (address: `0x${string}`, owner: `0x${string}`) => Promise<Verification>
}

async function fetchDiscover(owner: `0x${string}`, signal: AbortSignal) {
  const response = await fetch(`/api/accounts/discover?owner=${encodeURIComponent(owner)}`, { signal })
  return { ok: response.ok, body: await response.json() as DiscoverBody }
}

/**
 * The accounts this owner deployed that pass Leash verification.
 *
 * One implementation for /accounts and /setup (CLAUDE.md: two
 * implementations of one operation must not behave differently). It saves
 * nothing and never throws; the caller decides what to remember and what to
 * say. Explorer data only names candidates -- verifyPolicyAccount decides.
 */
export async function findOwnedAccounts(
  owner: `0x${string}`,
  signal: AbortSignal,
  deps: Deps = {},
): Promise<OwnedAccountsResult> {
  const fetchCandidates = deps.fetchCandidates ?? fetchDiscover
  const verify = deps.verify ?? verifyPolicyAccount
  let response: { ok: boolean; body: DiscoverBody }
  try {
    response = await fetchCandidates(owner, signal)
  } catch {
    return signal.aborted ? { status: 'aborted' } : { status: 'failed' }
  }
  // Replaced while the body was read. Nothing below is about this owner.
  if (signal.aborted) return { status: 'aborted' }
  const { ok, body } = response
  if (!ok || !Array.isArray(body.accounts)) {
    return { status: body.code === 'DISCOVERY_NOT_CONFIGURED' ? 'not-configured' : 'failed' }
  }

  const verified: DiscoveredAccountCandidate[] = []
  // Counted, not collapsed into a miss: a candidate the chain never answered
  // for has not been rejected, and no caller may imply it was.
  let unreadable = 0
  // Bounded concurrency: an active owner can have many unrelated deployments.
  for (let start = 0; start < body.accounts.length; start += 5) {
    const batch = body.accounts.slice(start, start + 5)
    const results = await Promise.all(batch.map(async (candidate) => ({
      candidate,
      result: await verify(candidate.address, owner),
    })))
    if (signal.aborted) return { status: 'aborted' }
    for (const { candidate, result } of results) {
      if (result === 'unreadable') unreadable++
      else if (result === 'verified') verified.push(candidate)
    }
  }
  return { status: 'ok', verified, unreadable, historyTruncated: Boolean(body.historyTruncated) }
}

/** Highest deploy block, compared as a number. */
export function newestAccount(
  list: readonly DiscoveredAccountCandidate[],
): DiscoveredAccountCandidate | null {
  let best: DiscoveredAccountCandidate | null = null
  for (const item of list) {
    if (!best || BigInt(item.deployBlock) > BigInt(best.deployBlock)) best = item
  }
  return best
}

export const LOOKUP_UNCERTAIN =
  'Could not confirm whether this wallet already owns a protected account. Check My accounts before creating another — a second account is a second deployment fee.'

/**
 * What /setup says after looking. Never "none" on a read that did not
 * happen: an uncertain answer says so, and still leaves Create enabled, since
 * a deployment without an explorer key must be able to create an account.
 */
export function accountLookupNote(result: OwnedAccountsResult): string | null {
  if (result.status === 'aborted') return null
  if (result.status !== 'ok') return LOOKUP_UNCERTAIN
  if (result.verified.length > 1) {
    return `This wallet owns ${result.verified.length} protected accounts. Resumed the newest; open My accounts to choose another.`
  }
  if (result.verified.length === 0 && (result.unreadable > 0 || result.historyTruncated)) return LOOKUP_UNCERTAIN
  return null
}
```

The two `// ---- moved verbatim …` lines mark where the moved code goes. Replace each marker with the code itself.

- [x] **Step 4: Point `AccountsPage` at it**

In `app/components/AccountsPage.tsx`:

1. Delete `TOKEN`, `VERIFY_ABI`, `answeredByTheContract` and `verifyPolicyAccount`, together with the now-unused imports: the `viem` import, `publicClient`, and `type DiscoveredAccountCandidate` (keep `describeDiscovery`).
2. Add `import { findOwnedAccounts } from '../lib/ownedAccounts.js'`.
3. Replace the body of `discoverAccounts` with:
   ```ts
     async function discoverAccounts(owner: `0x${string}`, signal: AbortSignal) {
       setDiscovering(true)
       setDiscoveryNote(null)
       // A stale count would let the previous run's outage keep suppressing this
       // run's honest "none were found".
       setUnreadableCount(0)
       try {
         const result = await findOwnedAccounts(owner, signal)
         if (result.status === 'aborted') return
         if (result.status !== 'ok') {
           setDiscoveryNote(result.status === 'not-configured'
             ? 'Automatic discovery is not configured. Add the explorer API key and refresh.'
             : 'Could not refresh account history. Showing the last saved list.')
           return
         }
         for (const candidate of result.verified) savePolicyAccount(localStorage, owner, candidate)
         setAccounts(listPolicyAccounts(localStorage, owner))
         announceAccountRegistryChange()
         setUnreadableCount(result.unreadable)
         setDiscoveryNote(describeDiscovery({
           verified: result.verified.length,
           unreadable: result.unreadable,
           historyTruncated: result.historyTruncated,
         }))
       } catch {
         // Only storage can throw here: findOwnedAccounts never does.
         setDiscoveryNote('Could not refresh account history. Showing the last saved list.')
       } finally {
         if (!signal.aborted) setDiscovering(false)
       }
     }
   ```

- [x] **Step 5: Wire the lookup into `/setup`**

In `app/app/setup/page.tsx`:

1. Extend the registry import so it reads:
   ```ts
   import {
     announceAccountRegistryChange, listPolicyAccounts, migrateLegacyAccount, savePolicyAccount, selectPolicyAccount,
   } from '../../lib/accountRegistry.js'
   ```
   and add:
   ```ts
   import { accountLookupNote, findOwnedAccounts, newestAccount } from '../../lib/ownedAccounts.js'
   ```
2. Directly below the `useArming()` line Task 1 added, add:
   ```ts
     /** lib/ownedAccounts.ts: whether this wallet already owns an account nobody saved here. */
     const [lookup, setLookup] = useState<'idle' | 'searching'>('idle')
     const [lookupNote, setLookupNote] = useState<string | null>(null)
   ```
3. Directly below Task 1's pending-deploy effect (the one ending `}, [connected])` that calls `parsePendingDeploy`), add:
   ```ts
     // A wallet this browser has never seen may still own an account -- another
     // device, cleared site data, a deploy whose tab was closed. Looked up before
     // step 1 offers to create one, because a second account is a second fee.
     // Not when the owner asked for a new account (?new=1), and not when the
     // registry already names one: the restore effect has that in hand.
     useEffect(() => {
       setLookup('idle')
       setLookupNote(null)
       if (!connected) return
       if (new URLSearchParams(window.location.search).get('new') === '1') return
       let known = 0
       try { known = listPolicyAccounts(localStorage, connected).length } catch { /* look it up */ }
       if (known > 0) return
       const controller = new AbortController()
       setLookup('searching')
       void (async () => {
         const result = await findOwnedAccounts(connected, controller.signal)
         if (result.status === 'aborted') return
         if (result.status === 'ok') {
           const newest = newestAccount(result.verified)
           try {
             for (const candidate of result.verified) savePolicyAccount(localStorage, connected, candidate)
             if (newest) selectPolicyAccount(localStorage, connected, newest.address)
           } catch { /* the chain is the record; see lib/browserStorage.ts */ }
           if (newest) {
             announceAccountRegistryChange()
             setAccount(newest.address)
           }
         }
         setLookupNote(accountLookupNote(result))
         setLookup('idle')
       })()
       return () => controller.abort()
     }, [connected])
   ```
4. Directly after the `{(error || restoreNote) && ( … )}` block, add:
   ```tsx
         {lookupNote && (
           <p role="status" className="mt-6" style={{ ...PROSE, color: 'var(--dim)' }}>{lookupNote}</p>
         )}
   ```
5. In step 1's no-account branch, directly above Task 1's `{pendingDeploy && (` block, add:
   ```tsx
                   {lookup === 'searching' && (
                     <p role="status" className="mt-4" style={{ ...PROSE, color: 'var(--dim)' }}>
                       Checking whether this wallet already owns a protected account…
                     </p>
                   )}
   ```
6. Change the Create button's `disabled` to:
   ```tsx
                     disabled={deploying || restoring || lookup === 'searching'
                       || (pendingDeploy !== null && pendingDeployBlocksCreate(pendingDeploy.check))}
   ```

- [x] **Step 6: Run the tests and typecheck**

Run: `pnpm -F @leash/app test && (cd app && npx tsc --noEmit)`
Expected: every test PASSES. tsc prints nothing.

- [x] **Step 7: Commit**

```bash
git add app/lib/ownedAccounts.ts app/test/ownedAccounts.test.ts app/components/AccountsPage.tsx app/test/accountDiscovery.test.ts app/app/setup/page.tsx app/test/setup.test.ts
git commit -m "fix(app): a wallet new to this browser was offered a second account it would pay for" -m "/setup showed step 1 whenever this browser's registry was empty, though the wallet might already own an account deployed from another device or before site data was cleared. It now runs the same discovery /accounts does, moved into lib/ownedAccounts.ts so the two cannot drift, resumes the newest verified account, and keeps Create shut while it looks. An uncertain answer is said out loud rather than read as none.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The restore path recovers an authorised agent it was not told about (spec §2.4)

**Files:**
- Create: `app/lib/agentDiscovery.ts`
- Create: `app/app/api/accounts/operators/route.ts`
- Create: `app/test/agentDiscovery.test.ts`
- Modify: `app/app/setup/page.tsx` (imports; the agent block in the restore effect)
- Modify: `app/test/setup.test.ts` (append)

**Interfaces:**
- Consumes: `liveOperators`, `OperatorChange` from `app/lib/feed.ts`; `isValidAddress` from `app/lib/address.ts`
- Produces:
  - `OPERATOR_CHANGED_TOPIC` (computed with `toEventSelector`, never a literal)
  - `etherscanLogsUrl(account, apiKey, page): string`
  - `operatorChangesFromExplorer(value: unknown, account: string): OperatorChange[]`
  - `fetchOperatorCandidates(account, signal?): Promise<readonly \`0x${string}\`[]>`
  - `recoverAgent(input): Promise<\`0x${string}\` | null>`
  - route `GET /api/accounts/operators?account=`

- [ ] **Step 1: Write the failing tests**

Create `app/test/agentDiscovery.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAbiItem, getAddress, toEventSelector } from 'viem'
import { abi } from '../lib/contract.js'
import {
  OPERATOR_CHANGED_TOPIC, etherscanLogsUrl, fetchOperatorCandidates, operatorChangesFromExplorer, recoverAgent,
} from '../lib/agentDiscovery.js'
import { GET } from '../app/api/accounts/operators/route'

const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d'
const OWNER = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57' as const
const A = '0xd44daf6db6c8057c206e6acc27e6384b8ec850d6'
const B = '0x64ad61211c1b0b7f20b3e04b49661f30f152ae78'
const topic = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}`
const bool = (on: boolean) => `0x${'0'.repeat(63)}${on ? 1 : 0}`
const log = (operator: string, enabled: boolean, block: string, index = '0x') => ({
  address: ACCOUNT.toLowerCase(),
  topics: [OPERATOR_CHANGED_TOPIC, topic(operator)],
  data: bool(enabled),
  blockNumber: block,
  logIndex: index,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the OperatorChanged query', () => {
  // Against the compiled ABI, not the same string again: a renamed or
  // re-typed event in the contract has to break this.
  it('asks for the event the contract emits', () => {
    expect(OPERATOR_CHANGED_TOPIC).toBe(toEventSelector(getAbiItem({ abi, name: 'OperatorChanged' })))
  })

  it('asks Celo mainnet for the whole history of one account', () => {
    const url = new URL(etherscanLogsUrl(ACCOUNT, 'k', 2))
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      chainid: '42220', module: 'logs', action: 'getLogs', address: ACCOUNT,
      topic0: OPERATOR_CHANGED_TOPIC, fromBlock: '0', toBlock: 'latest', page: '2', offset: '1000', apikey: 'k',
    })
  })
})

describe('operatorChangesFromExplorer', () => {
  // The entry Etherscan returned for 0xBE380aa7 on 2026-09-17, trimmed.
  it('reads the measured response, where zero is written as a bare 0x', () => {
    expect(operatorChangesFromExplorer([log(A, true, '0x49bcbde')], ACCOUNT)).toEqual([
      { operator: getAddress(A), enabled: true, blockNumber: 0x49bcbden, logIndex: 0 },
    ])
  })

  it('reads a revocation', () => {
    expect(operatorChangesFromExplorer([log(A, false, '0x10', '0x3')], ACCOUNT)[0])
      .toMatchObject({ enabled: false, logIndex: 3 })
  })

  it('drops anything it cannot trust', () => {
    const good = log(A, true, '0x10')
    expect(operatorChangesFromExplorer([
      { ...good, address: B },
      { ...good, topics: ['0x' + '1'.repeat(64), topic(A)] },
      { ...good, topics: [OPERATOR_CHANGED_TOPIC, '0x1234'] },
      { ...good, data: '0x01' },
      { ...good, blockNumber: 'ten' },
      null,
      'x',
    ], ACCOUNT)).toEqual([])
    expect(operatorChangesFromExplorer('Invalid API Key', ACCOUNT)).toEqual([])
  })
})

describe('GET /api/accounts/operators', () => {
  const call = (account: string) => GET(new Request(`http://test/api/accounts/operators?account=${account}`))
  const explorer = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))))

  it('refuses an invalid account', async () => {
    expect((await call('nope')).status).toBe(400)
  })

  it('says when the explorer is not configured', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', '')
    vi.stubEnv('CELOSCAN_KEY', '')
    const response = await call(ACCOUNT)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'DISCOVERY_NOT_CONFIGURED' })
  })

  it('returns live operators, newest authorisation first, without the revoked', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'k')
    explorer({ status: '1', message: 'OK', result: [
      log(A, true, '0x10'), log(B, true, '0x20'), log(A, false, '0x30'),
    ] })
    const response = await call(ACCOUNT)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ operators: [getAddress(B)] })
  })

  it('treats an empty history as an empty list', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'k')
    explorer({ status: '0', message: 'No records found', result: [] })
    expect(await (await call(ACCOUNT)).json()).toEqual({ operators: [] })
  })

  it('fails on an explorer error rather than answering none', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'k')
    explorer({ status: '0', message: 'NOTOK', result: 'Invalid API Key' })
    expect((await call(ACCOUNT)).status).toBe(502)
  })
})

describe('fetchOperatorCandidates', () => {
  it('returns the valid addresses the route named', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ operators: [getAddress(A), 'junk', 7] }))))
    expect(await fetchOperatorCandidates(ACCOUNT)).toEqual([getAddress(A)])
  })

  it('throws on a failed or malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })))
    await expect(fetchOperatorCandidates(ACCOUNT)).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    await expect(fetchOperatorCandidates(ACCOUNT)).rejects.toThrow()
  })
})

describe('recoverAgent', () => {
  const a = getAddress(A)
  const b = getAddress(B)

  it('returns the first candidate operators() confirms, in candidate order', async () => {
    expect(await recoverAgent({
      owner: OWNER,
      candidates: async () => [a, b],
      isOperator: async (candidate) => candidate === b,
    })).toBe(b)
  })

  // One Promise.all, so viem multicalls the reads: every check starts before any finishes.
  it('asks about every candidate at once', async () => {
    const started: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const pending = recoverAgent({
      owner: OWNER,
      candidates: async () => [a, b],
      isOperator: async (candidate) => { started.push(candidate); await gate; return false },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(started).toEqual([a, b])
    release()
    expect(await pending).toBeNull()
  })

  // The wizard refuses the owner as its own agent; recovery must not hand it back.
  it('never offers the owner', async () => {
    expect(await recoverAgent({
      owner: OWNER.toLowerCase(),
      candidates: async () => [OWNER],
      isOperator: async () => true,
    })).toBeNull()
  })

  it('fails closed and quietly', async () => {
    expect(await recoverAgent({
      owner: OWNER, candidates: async () => { throw new Error('502') }, isOperator: async () => true,
    })).toBeNull()
    expect(await recoverAgent({
      owner: OWNER, candidates: async () => [a], isOperator: async () => { throw new Error('rpc') },
    })).toBeNull()
  })
})

describe('the wizard recovers its agent', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')
  const restore = source.slice(source.indexOf('// Local storage supplies candidates'), source.indexOf('async function deploy()'))

  it('asks the explorer only when the saved agent is missing or no longer authorised', () => {
    expect(restore).toContain('if (!knownAgent && !cancelled)')
    expect(restore).toContain('fetchOperatorCandidates(account)')
    expect(restore.indexOf('recoverAgent(')).toBeGreaterThan(restore.indexOf('const savedAgent'))
  })

  it('remembers what it recovered', () => {
    expect(restore).toContain('writeLocal(`leash.agent.${account.toLowerCase()}`, knownAgent)')
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm -F @leash/app test -- agentDiscovery`
Expected: FAIL with `Failed to resolve import "../lib/agentDiscovery.js"`.

- [ ] **Step 3: Implement `app/lib/agentDiscovery.ts`**

```ts
import { getAddress, toEventSelector } from 'viem'
import { isValidAddress } from './address.js'
import type { OperatorChange } from './feed.js'

/**
 * Computed, not written out: scripts/check-secrets.sh reads any bare 64-hex
 * value as a possible private key. Once per module load, not per request.
 * agentDiscovery.test.ts holds it to the event in the compiled ABI.
 */
export const OPERATOR_CHANGED_TOPIC = toEventSelector('OperatorChanged(address,bool)')

/**
 * The whole OperatorChanged history of one account, from the explorer.
 *
 * Not from forno: `operators` is a mapping and cannot be enumerated, and a
 * getLogs walk costs (age / 5,000) round trips -- the dashboard caps its walk
 * at 24 hours for exactly that reason, which is why an agent authorised last
 * week was invisible to it. The explorer answers the whole range in one call.
 */
export function etherscanLogsUrl(account: string, apiKey: string, page: number): string {
  const query = new URLSearchParams({
    chainid: '42220',
    module: 'logs',
    action: 'getLogs',
    address: account,
    topic0: OPERATOR_CHANGED_TOPIC,
    fromBlock: '0',
    toBlock: 'latest',
    page: String(page),
    offset: '1000',
    apikey: apiKey,
  })
  return `https://api.etherscan.io/v2/api?${query}`
}

function hexNumber(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) return null
  // Etherscan writes zero as a bare "0x": measured 2026-09-17 on 0xBE380aa7,
  // whose only OperatorChanged log came back with `logIndex: "0x"`.
  return value === '0x' ? 0n : BigInt(value)
}

/**
 * Explorer logs as OperatorChange, dropping anything that does not parse.
 * Only candidates: operators() on the account decides.
 */
export function operatorChangesFromExplorer(value: unknown, account: string): OperatorChange[] {
  if (!Array.isArray(value)) return []
  const changes: OperatorChange[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as { address?: unknown; topics?: unknown; data?: unknown; blockNumber?: unknown; logIndex?: unknown }
    if (typeof entry.address !== 'string' || entry.address.toLowerCase() !== account.toLowerCase()) continue
    if (!Array.isArray(entry.topics)) continue
    const [topic0, topic1] = entry.topics as unknown[]
    if (typeof topic0 !== 'string' || topic0.toLowerCase() !== OPERATOR_CHANGED_TOPIC) continue
    if (typeof topic1 !== 'string' || !/^0x0{24}[0-9a-fA-F]{40}$/.test(topic1)) continue
    if (typeof entry.data !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(entry.data)) continue
    const blockNumber = hexNumber(entry.blockNumber)
    const logIndex = hexNumber(entry.logIndex)
    if (blockNumber === null || logIndex === null) continue
    changes.push({
      operator: getAddress(`0x${topic1.slice(26)}`),
      enabled: BigInt(entry.data) !== 0n,
      blockNumber,
      logIndex: Number(logIndex),
    })
  }
  return changes
}

/** The route's answer. Throws on anything but a list, so recoverAgent fails closed. */
export async function fetchOperatorCandidates(
  account: string,
  signal?: AbortSignal,
): Promise<readonly `0x${string}`[]> {
  const response = await fetch(`/api/accounts/operators?account=${encodeURIComponent(account)}`, { signal })
  if (!response.ok) throw new Error(`Operator lookup returned ${response.status}`)
  const body = await response.json() as { operators?: unknown }
  if (!Array.isArray(body.operators)) throw new Error('Operator lookup returned no list')
  return body.operators.filter((item): item is `0x${string}` => typeof item === 'string' && isValidAddress(item))
}

/**
 * The authorised agent this browser was not told about, or null.
 *
 * Never throws: a failed lookup leaves the wizard exactly where it was
 * before this existed, at step 3, where pasting the address still works.
 */
export async function recoverAgent(input: {
  owner: string
  candidates: () => Promise<readonly `0x${string}`[]>
  isOperator: (candidate: `0x${string}`) => Promise<boolean>
}): Promise<`0x${string}` | null> {
  try {
    // The wizard refuses the owner as its own agent (addAgent).
    const list = (await input.candidates())
      .filter((candidate) => candidate.toLowerCase() !== input.owner.toLowerCase())
    // One Promise.all, so viem multicalls every operators() read.
    const checks = await Promise.all(list.map(async (candidate) => ({
      candidate,
      ok: await input.isOperator(candidate),
    })))
    return checks.find((check) => check.ok)?.candidate ?? null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Implement `app/app/api/accounts/operators/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { isValidAddress } from '../../../../lib/address.js'
import { etherscanLogsUrl, operatorChangesFromExplorer } from '../../../../lib/agentDiscovery.js'
import { liveOperators, type OperatorChange } from '../../../../lib/feed.js'

type ExplorerResponse = {
  status?: string
  message?: string
  result?: unknown
}

const PAGE_SIZE = 1000
const MAX_PAGES = 10

/**
 * Who this account has authorised, newest first, revoked ones excluded.
 * Candidates only: the caller checks each against operators().
 * Same shape and same key as /api/accounts/discover.
 */
export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account') ?? ''
  if (!isValidAddress(account)) {
    return NextResponse.json({ error: 'A valid account address is required.' }, { status: 400 })
  }

  // Server-only, as in the discover route: the key is the product's rate limit.
  const apiKey = process.env.ETHERSCAN_API_KEY ?? process.env.CELOSCAN_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'Operator discovery is not configured.',
      code: 'DISCOVERY_NOT_CONFIGURED',
    }, { status: 503 })
  }

  try {
    const changes: OperatorChange[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await fetch(etherscanLogsUrl(account, apiKey, page), {
        headers: { accept: 'application/json' },
        next: { revalidate: 60 },
      })
      if (!response.ok) throw new Error(`Explorer returned ${response.status}`)
      const body = await response.json() as ExplorerResponse
      // Measured 2026-09-17: an account with no such logs answers exactly this.
      if (body.status === '0' && body.message === 'No records found') break
      if (body.status !== '1' || !Array.isArray(body.result)) {
        throw new Error(typeof body.result === 'string' ? body.result : 'Invalid explorer response')
      }
      changes.push(...operatorChangesFromExplorer(body.result, account))
      if (body.result.length < PAGE_SIZE) break
    }
    return NextResponse.json({ operators: liveOperators(changes) }, {
      // Short: a just-authorised agent is remembered locally by the tab that
      // authorised it; this serves the other devices.
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    })
  } catch {
    return NextResponse.json({ error: 'Celo operator history is temporarily unavailable.' }, { status: 502 })
  }
}
```

- [ ] **Step 5: Run the lib and route tests**

Run: `pnpm -F @leash/app test -- agentDiscovery`
Expected: every test except the `the wizard recovers its agent` block PASSES. If `liveOperators` returns addresses in a different case from the input, adjust only the test's expected value to match `liveOperators` in `app/lib/feed.ts`, and say so in your report.

- [ ] **Step 6: Wire recovery into the restore effect**

In `app/app/setup/page.tsx`:

1. Add:
   ```ts
   import { fetchOperatorCandidates, recoverAgent } from '../../lib/agentDiscovery.js'
   ```
2. In the restore effect, replace everything from `let authorized = false` down to the closing `}` of `if (savedAgent && isValidAddress(savedAgent)) { … }` with:
   ```ts
           let authorized = false
           let operatorBalance: bigint | null = null
           const isOperator = (candidate: `0x${string}`) => publicClient.readContract({
             address: account, abi: SETUP_ABI, functionName: 'operators', args: [candidate],
           }) as Promise<boolean>
           let knownAgent: `0x${string}` | null = null
           const savedAgent = readLocal(`leash.agent.${account.toLowerCase()}`)
           if (savedAgent && isValidAddress(savedAgent) && await isOperator(savedAgent)) {
             knownAgent = savedAgent
           }
           // This browser was never told, or was told about an agent since
           // revoked. The explorer names candidates from OperatorChanged history
           // and operators() decides. recoverAgent never throws: a failed lookup
           // leaves step 3 as it was, where pasting the address still works.
           if (!knownAgent && !cancelled) {
             knownAgent = await recoverAgent({
               owner: connected,
               candidates: () => fetchOperatorCandidates(account),
               isOperator,
             })
             if (knownAgent && !cancelled) writeLocal(`leash.agent.${account.toLowerCase()}`, knownAgent)
           }
           if (knownAgent) {
             authorized = true
             if (!cancelled) {
               setAgent(knownAgent)
               setAgentAuthorized(true)
             }
             try {
               operatorBalance = await readBalance(knownAgent)
               if (!cancelled) setAgentBalance({ status: 'ok', value: operatorBalance })
             } catch {
               // The authorization was independently verified. A transient
               // token-balance read must not send the user back to account creation.
               // It says so on screen now instead of reading as "Checking…".
               // Flatly 'failed', not afterFailedRead: this effect reset the
               // balance a few lines above, so there is no earlier figure to keep.
               if (!cancelled) setAgentBalance({ status: 'failed' })
             }
           }
   ```

- [ ] **Step 7: Run the full suite, typecheck and e2e**

Run: `pnpm -F @leash/app test && (cd app && npx tsc --noEmit) && pnpm -F @leash/app test:e2e`. If port 3000 is busy, use the `LEASH_E2E_URL` form from Global Constraints.
Expected: every vitest test PASSES, tsc prints nothing, and every Playwright spec PASSES.

- [ ] **Step 8: Commit**

```bash
git add app/lib/agentDiscovery.ts app/app/api/accounts/operators/route.ts app/test/agentDiscovery.test.ts app/app/setup/page.tsx
git commit -m "fix(app): a resumed setup asked again for an agent the account had already authorised" -m "The restore path knew an agent only from this browser's localStorage, so another device, cleared site data or Safari private mode stopped at step 3 asking for an agent the contract already trusts. A new route reads the account's whole OperatorChanged history from the explorer -- forno would cost a round trip per 5,000 blocks, which is why the dashboard stops at 24 hours -- and the wizard checks each candidate against operators() in one batch, remembers the one that passes, and carries on as if it had been saved.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Manual verification in a browser wallet (spec §3)

No automated test here can drive an injected wallet. This task writes nothing to the repo unless something fails.

- [ ] **Step 1: Start the app**

Run: `pnpm -F @leash/app dev`, then open `http://localhost:3000` in a browser whose wallet extension holds wallet A (owns a Leash account with an authorised agent) and wallet B (owns none).

- [ ] **Step 2: Check each item and record what was seen**

| Check | Steps | Expected |
|---|---|---|
| §2.3 found | As A, DevTools → Application → Local Storage: delete `leash.accounts.*` for A, `leash.account` and `leash.accountOwner`, then reload `/setup` | Briefly shows `Checking whether this wallet already owns a protected account…` with Create disabled, then resumes A's account at its real step. |
| §2.3 none | As B, reload `/setup` | The checking line appears, then Create becomes enabled with no note. |
| §2.3 new | As A, open `/setup?new=1` | No lookup; step 1 with Create enabled. |
| §2.4 | As A, delete `leash.agent.<A's account lower-case>` and reload `/setup` | Resumes past step 3 with the agent shown as authorised; the key is back in localStorage. |
| §2.2 unknown | As B, in Console: `localStorage.setItem('leash.pendingDeploy.' + '<B lower-case>', JSON.stringify({ hash: '0x' + '1'.repeat(64), owner: '<B>', sentAt: Date.now() }))`, then reload `/setup` | Panel: `Celo does not know the deployment…`, Create disabled, **Check again**, and **It never landed — deploy again**, which reads **Confirm: deploy again** on the first press. Do not press it a second time unless you mean to deploy. Remove the key afterwards. |
| §2.2 landed | As A, set the same key for A with the hash of A's real deployment transaction, then reload `/setup?new=1` | Resumes A's account; the key is removed. |
| §2.2 real (optional, one mainnet deployment) | As B, press Create, sign, then close the tab while it shows `Waiting for Celo…`. Reopen `/setup` | Either resumes the new account, or shows the waiting panel with Create disabled until it lands. |

- [ ] **Step 3: Report**

For each row, report what was actually seen. If a row fails, go back to its task with superpowers:systematic-debugging, and do not mark it done.
