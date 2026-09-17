# Wallet Session Across Routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every route behave correctly when the wallet disconnects, switches account, or fails to connect: a generated key is never shown to the wrong wallet, `/setup` only resumes an account the wallet owns, `ConnectButton` reports what happened, `/accounts` never shows another owner's list, and a dashboard write in flight keeps its outcome.

**Architecture:** Each decision is a pure function in `app/lib/`, unit-tested in the node environment. Components only call these functions. Where the property that matters is the wiring, a source ratchet test (the pattern in `app/test/agentKey.test.ts`) reads the `.tsx` file and asserts it.

**Tech Stack:** Next.js App Router, wagmi 2.19, viem, vitest (node environment), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-17-leash-wallet-session-design.md`

## Global Constraints

- No new dependency, and no component-testing library. `app/vitest.config.ts` stays `environment: 'node'`.
- Never run `test:gate` in `sdk` or `mcp`. It spends real money on mainnet.
- A read that belongs with others goes **inside** the existing `Promise.all`, never awaited after it, or multicall batching breaks.
- Every write keeps its explicit `chainId: REQUIRED_CHAIN_ID` and its explicit `gas`.
- Never report a write as anything other than what was observed.
- Comments explain *why*. Keep the existing hazard comments when you edit nearby code.
- Commit subjects describe the defect in plain English, e.g. `fix(app): a generated agent key stayed on screen for the next wallet`. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Run commands from the repo root `/Users/vanhuy/Desktop/celo` unless a step says otherwise.
- Paths below are relative to the repo root.

---

### Task 1: The generated key belongs to one wallet and one agent (spec §2.2)

**Files:**
- Modify: `app/lib/agentKey.ts` (append)
- Modify: `app/app/setup/page.tsx` (imports; `generatedKey` state at ~line 261; connected effect at ~line 321; the Generate button at ~line 1167; the two `<GeneratedKeyPanel>` renders at ~lines 1204 and 1351)
- Test: `app/test/agentKey.test.ts` (append)

**Interfaces:**
- Produces: `export type HeldAgentKey = { privateKey: \`0x${string}\`; wallet: string } | null` and `export function keyToShow(held: HeldAgentKey, connected: string | null | undefined, agent: string): \`0x${string}\` | null`

- [x] **Step 1: Write the failing tests**

Add `keyToShow` to the existing import from `'../lib/agentKey.js'` at the top of `app/test/agentKey.test.ts`, so it reads `import { generateAgentWallet, keyToShow } from '../lib/agentKey.js'`. Then append:

```ts
/**
 * The key is scoped to the wallet that generated it and the agent it controls.
 * React does not remount on a disconnect or an account switch, so a key held
 * in state used to be shown to whoever connected next -- beside their agent,
 * where it would be pasted into OPERATOR_PK and silently be the wrong key.
 */
describe('keyToShow', () => {
  const OWNER_A = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
  const OWNER_B = '0x64Ad61211C1b0B7f20B3e04B49661f30f152ae78'

  it('shows the key to the wallet that generated it, for the agent it controls', () => {
    const wallet = generateAgentWallet()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, OWNER_A, wallet.address))
      .toBe(wallet.privateKey)
  })

  it('hides it from another wallet', () => {
    const wallet = generateAgentWallet()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, OWNER_B, wallet.address))
      .toBeNull()
  })

  it('hides it once the wallet disconnects', () => {
    const wallet = generateAgentWallet()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, undefined, wallet.address))
      .toBeNull()
  })

  it('hides it beside an agent the key does not control', () => {
    const wallet = generateAgentWallet()
    const other = generateAgentWallet()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, OWNER_A, other.address))
      .toBeNull()
    expect(keyToShow({ privateKey: wallet.privateKey, wallet: OWNER_A }, OWNER_A, '')).toBeNull()
  })

  it('ignores checksum casing on both comparisons', () => {
    const wallet = generateAgentWallet()
    expect(keyToShow(
      { privateKey: wallet.privateKey, wallet: OWNER_A.toLowerCase() },
      OWNER_A,
      wallet.address.toLowerCase(),
    )).toBe(wallet.privateKey)
  })

  it('has nothing to show when nothing was generated', () => {
    expect(keyToShow(null, OWNER_A, OWNER_B)).toBeNull()
  })

  it('is what the wizard renders, and the wizard drops the key on disconnect', () => {
    const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')
    expect(source).not.toMatch(/privateKey=\{generatedKey\}/)
    expect(source).toMatch(/keyToShow\(generatedKey, connected, agent\)/)
    // Located from its dependency list backwards, so Task 2 adding a line at
    // the top of this effect does not break the ratchet.
    const end = source.indexOf('}, [connected])')
    const connectedEffect = source.slice(source.lastIndexOf('useEffect(', end), end)
    expect(connectedEffect).toContain('setGeneratedKey(null)')
  })
})
```

- [x] **Step 2: Run the tests and confirm they fail**

Run: `pnpm -F @leash/app test -- agentKey`
Expected: FAIL. `keyToShow` is not exported, so the suite errors or the calls throw `keyToShow is not a function`.

- [x] **Step 3: Implement `keyToShow`**

Append to `app/lib/agentKey.ts`. `privateKeyToAccount` is already imported there.

```ts
/**
 * A generated key, and the owner wallet that was connected when it was made.
 *
 * Held with its wallet for the reason lib/walletNote.ts gives: React does not
 * remount on an account switch, so state outlives the wallet it was about.
 */
export type HeldAgentKey = { privateKey: `0x${string}`; wallet: string } | null

/**
 * The key to put on screen, or null.
 *
 * Both checks are needed. The wallet check keeps it from the next person at a
 * shared browser. The agent check keeps it from sitting beside an agent it
 * does not control -- the restore path replaces `agent` on a wallet switch,
 * and a key shown beside the wrong address gets pasted into OPERATOR_PK.
 */
export function keyToShow(
  held: HeldAgentKey,
  connected: string | null | undefined,
  agent: string,
): `0x${string}` | null {
  if (!held || !connected || !agent) return null
  if (held.wallet.toLowerCase() !== connected.toLowerCase()) return null
  const controls = privateKeyToAccount(held.privateKey).address
  return controls.toLowerCase() === agent.toLowerCase() ? held.privateKey : null
}
```

- [x] **Step 4: Wire it into the wizard**

In `app/app/setup/page.tsx`:

1. Change the import:
   ```ts
   import { generateAgentWallet, keyToShow, type HeldAgentKey } from '../../lib/agentKey.js'
   ```
2. Replace
   ```ts
   const [generatedKey, setGeneratedKey] = useState<`0x${string}` | null>(null)
   ```
   with
   ```ts
   const [generatedKey, setGeneratedKey] = useState<HeldAgentKey>(null)
   ```
   Keep the doc comment above it.
3. Directly below the `agentTransactionsLeft` / `readiness` block (just before `function stageUnlocked`), add:
   ```ts
   // Scoped, not merely cleared: see keyToShow.
   const shownKey = keyToShow(generatedKey, connected, agent)
   ```
4. In the connected effect, replace
   ```ts
       if (!connected) {
         setAccount(null)
         setActiveStage(1)
         return
       }
   ```
   with
   ```ts
       if (!connected) {
         // Out of memory, not only off the screen: a disconnect is how someone
         // at a shared browser says they are done.
         setGeneratedKey(null)
         setAccount(null)
         setActiveStage(1)
         return
       }
   ```
5. In the Generate button's `onClick`, replace `setGeneratedKey(wallet.privateKey)` with:
   ```ts
                       setGeneratedKey({ privateKey: wallet.privateKey, wallet: connected ?? '' })
   ```
   Replace the label expression `{generatedKey ? 'Generate a different wallet' : 'Generate agent wallet'}` with `{shownKey ? 'Generate a different wallet' : 'Generate agent wallet'}`.
6. Replace **both** occurrences of
   ```tsx
   {generatedKey && <GeneratedKeyPanel privateKey={generatedKey} />}
   ```
   with
   ```tsx
   {shownKey && <GeneratedKeyPanel privateKey={shownKey} />}
   ```

- [x] **Step 5: Run the tests and typecheck**

Run: `pnpm -F @leash/app test -- agentKey && (cd app && npx tsc --noEmit)`
Expected: all `agentKey` tests PASS, including the existing ratchet `is never written to browser storage by the wizard`. tsc prints nothing.

- [x] **Step 6: Commit**

```bash
git add app/lib/agentKey.ts app/app/setup/page.tsx app/test/agentKey.test.ts
git commit -m "fix(app): a generated agent key stayed on screen for the next wallet" -m "React does not remount on a disconnect or an account switch, so the key the wizard generated for wallet A was still rendered at steps 3 and 4 after wallet B connected, beside B's agent. keyToShow scopes it to the wallet that made it and the agent it controls, and a disconnect drops it from memory.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `/setup` resumes only an account the wallet owns (spec §2.3)

**Files:**
- Modify: `app/lib/setup.ts` (append)
- Modify: `app/app/setup/page.tsx` (imports, `SETUP_ABI`, the connected effect, the restore effect at ~line 348, `deploy()` at ~line 458)
- Test: `app/test/setup.test.ts` (append)

**Interfaces:**
- Consumes: `canEdit(owner, connected): boolean` from `app/lib/policy.ts`
- Produces: `export const NOT_OWNER_NOTE: string`, `export function restoredOwnerNote(owner: string, connected: string): string | null`, `export function afterDeployNote(account: string, owner: string, connectedNow: string | null | undefined): string | null`

- [x] **Step 1: Write the failing tests**

Add `NOT_OWNER_NOTE, afterDeployNote, restoredOwnerNote` to the import from `'../lib/setup.js'` at the top of `app/test/setup.test.ts`. Add these imports below it:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
```

Append:

```ts
const OWNER_A = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
const OWNER_B = '0x64Ad61211C1b0B7f20B3e04B49661f30f152ae78'
const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d'

/**
 * localStorage names candidates; owner() decides. Every write the wizard sends
 * carries an explicit gas, so a wallet has no estimate to fail on -- a
 * non-owner's setPolicy is broadcast, reverts, and is paid for.
 */
describe('restoredOwnerNote', () => {
  it('resumes an account the connected wallet owns, whatever the casing', () => {
    expect(restoredOwnerNote(OWNER_A.toLowerCase(), OWNER_A)).toBeNull()
  })

  it('refuses one it does not', () => {
    expect(restoredOwnerNote(OWNER_B, OWNER_A)).toBe(NOT_OWNER_NOTE)
  })
})

describe('afterDeployNote', () => {
  it('says nothing when the deploying wallet is still connected', () => {
    expect(afterDeployNote(ACCOUNT, OWNER_A, OWNER_A.toLowerCase())).toBeNull()
  })

  it('names the account and its owner when another wallet is connected now', () => {
    expect(afterDeployNote(ACCOUNT, OWNER_A, OWNER_B)).toBe(
      `Created ${ACCOUNT} for ${OWNER_A}. Connect that wallet again to continue setting it up.`,
    )
  })

  it('says the same when no wallet is connected now', () => {
    expect(afterDeployNote(ACCOUNT, OWNER_A, undefined)).toContain(`for ${OWNER_A}`)
  })
})

describe('the wizard checks ownership', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')

  it('reads owner() inside the restore batch and re-checks on a wallet switch', () => {
    const restore = source.slice(source.indexOf('// Local storage supplies candidates'), source.indexOf('async function deploy()'))
    const batch = restore.slice(restore.indexOf('await Promise.all(['), restore.indexOf('])'))
    expect(batch).toContain("functionName: 'owner'")
    expect(restore).toContain('restoredOwnerNote(')
    expect(restore).toContain('}, [account, connected])')
  })

  it('does not attach a new account to a wallet that did not deploy it', () => {
    const deploy = source.slice(source.indexOf('async function deploy()'), source.indexOf('async function setLimits()'))
    expect(deploy.indexOf('afterDeployNote(')).toBeGreaterThan(-1)
    expect(deploy.indexOf('afterDeployNote(')).toBeLessThan(deploy.indexOf('setAccount(outcome.address)'))
    expect(deploy).not.toContain('connected!')
  })
})
```

- [x] **Step 2: Run the tests and confirm they fail**

Run: `pnpm -F @leash/app test -- setup.test`
Expected: FAIL. The new functions are missing and the ratchets do not match.

- [x] **Step 3: Implement the helpers**

In `app/lib/setup.ts`, change the first line to `import { canEdit, formatDisplayAmount } from './policy.js'`, then append:

```ts
export const NOT_OWNER_NOTE =
  'The connected wallet does not own this protected account. Open My accounts to choose one it owns.'

/**
 * Whether the wizard may resume an account for this wallet.
 *
 * The candidate comes from localStorage, which knows nothing about a transfer
 * of ownership made since. Deliberately not paired with forgetPolicyAccount:
 * forno serves stale reads right after a transfer, and one stale owner() must
 * not delete a real entry.
 */
export function restoredOwnerNote(owner: string, connected: string): string | null {
  return canEdit(owner, connected) ? null : NOT_OWNER_NOTE
}

/**
 * What to say when a deployment confirms, if the wallet that sent it is no
 * longer the one connected.
 *
 * A contract creation is the longest wait in the app, which is plenty of time
 * to switch accounts in the wallet. The account is still saved under the
 * wallet that deployed it; this only stops the wizard carrying on with the
 * wrong one.
 */
export function afterDeployNote(
  account: string,
  owner: string,
  connectedNow: string | null | undefined,
): string | null {
  if (canEdit(owner, connectedNow)) return null
  return `Created ${account} for ${owner}. Connect that wallet again to continue setting it up.`
}
```

- [x] **Step 4: Wire the owner check into the restore effect**

In `app/app/setup/page.tsx`:

1. Extend the `lib/setup.js` import:
   ```ts
   import {
     afterDeployNote, afterFailedRead, balanceValue, describeBalance, describeTopUpMode, firstSetupStage,
     restoredOwnerNote, setupReadiness, type BalanceRead, type SetupStage,
   } from '../../lib/setup.js'
   ```
2. Add this entry as the last element of `SETUP_ABI`, before `] as const`:
   ```ts
     { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
   ```
3. In the connected effect, add `setRestoreNote(null)` as the **first** line of the effect body, above `if (!connected) {`, with this comment:
   ```ts
       // A note about the previous wallet's account is not about this one.
       setRestoreNote(null)
   ```
4. In the restore effect, change the destructuring and the array. Replace
   ```ts
           const [limits, policyBalance, listEnabled, topUp] = await Promise.all([
   ```
   with
   ```ts
           const [limits, policyBalance, listEnabled, topUp, owner] = await Promise.all([
   ```
   Then add this as the last element of that array, after the `topUpEnabled` read:
   ```ts
             // In the batch, not after it: localStorage only names a candidate,
             // and the chain is what says whose it is.
             publicClient.readContract({
               address: account, abi: SETUP_ABI, functionName: 'owner',
             }) as Promise<`0x${string}`>,
   ```
5. Directly after the first `if (cancelled) return` that follows that `Promise.all`, insert:
   ```ts
           const notOwner = connected ? restoredOwnerNote(owner, connected) : null
           if (!connected || notOwner) {
             setAccount(null)
             setRestoreNote(notOwner)
             setActiveStage(1)
             return
           }
   ```
6. Change the restore effect's dependency list from `}, [account])` to:
   ```ts
     // `connected` as well: after a transfer both wallets' registries can name
     // the same address, and a switch between them must be re-checked.
     }, [account, connected])
   ```

- [x] **Step 5: Close the deploy race**

1. Just below `const { writeContractAsync } = useWriteContract()` near the top of `Onboard`, add:
   ```ts
     /**
      * The wallet connected right now, for code that resumes after a long
      * await. A closure keeps the value from when the function started.
      */
     const connectedRef = useRef(connected)
     useEffect(() => { connectedRef.current = connected }, [connected])
   ```
2. In `deploy()`, after `if (chainId !== REQUIRED_CHAIN_ID) { setError(WRONG_NETWORK); return }`, add:
   ```ts
       if (!connected) return
       // Recorded once. The receipt can arrive after a switch in the wallet.
       const owner = connected
   ```
3. In `deploy()`, replace `args: [connected!]` with `args: [owner]`. Replace both `connected!` in the `savePolicyAccount` and `selectPolicyAccount` calls with `owner`.
4. In `deploy()`, move `setAccount(outcome.address)` so it runs after the registry writes and after the new check. The block after `if (!outcome.ok) { ... }` must read:
   ```ts
           savePolicyAccount(localStorage, owner, {
             address: outcome.address, deployBlock: receipt.blockNumber.toString(),
           })
           selectPolicyAccount(localStorage, owner, outcome.address)
           announceAccountRegistryChange()
           window.history.replaceState(null, '', '/setup')
           const switched = afterDeployNote(outcome.address, owner, connectedRef.current)
           if (switched) { setError(switched); return }
           setAccount(outcome.address)
           setActiveStage(2)
   ```

- [x] **Step 6: Run the tests and typecheck**

Run: `pnpm -F @leash/app test -- setup && (cd app && npx tsc --noEmit)`
Expected: PASS. tsc prints nothing.

- [x] **Step 7: Commit**

```bash
git add app/lib/setup.ts app/app/setup/page.tsx app/test/setup.test.ts
git commit -m "fix(app): the wizard resumed accounts the connected wallet did not own" -m "The restore path trusted localStorage for which account to resume and never read owner(), so after a transfer the previous owner was walked into writes that are sent with explicit gas and revert on chain. owner() now joins the restore batch, and the effect re-runs on a wallet switch. A deployment that confirms after a switch is saved under its deployer and no longer attached to the session that replaced it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `ConnectButton` says what happened (spec §2.4)

**Files:**
- Create: `app/lib/connectWallet.ts`
- Create: `app/test/connectWallet.test.ts`
- Modify: `app/components/ConnectButton.tsx` (full rewrite below)
- Modify: `app/app/a/[address]/page.tsx` (the header's `<ConnectButton />`)

**Interfaces:**
- Produces: `shouldAutoConnect(input: { miniPay: boolean; status: string; attempted: boolean }): boolean`, `describeConnectError(error: unknown): string | null`, and the constants `NO_WALLET`, `CONNECT_CANCELLED`, `CONNECT_PENDING`, `CONNECT_FAILED`. `ConnectButton` gains the prop `onDangerBand?: boolean`.

- [x] **Step 1: Write the failing tests**

Create `app/test/connectWallet.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProviderNotFoundError } from 'wagmi'
import { UserRejectedRequestError } from 'viem'
import {
  CONNECT_CANCELLED, CONNECT_FAILED, CONNECT_PENDING, NO_WALLET,
  describeConnectError, shouldAutoConnect,
} from '../lib/connectWallet.js'

describe('shouldAutoConnect', () => {
  it('connects once inside MiniPay', () => {
    expect(shouldAutoConnect({ miniPay: true, status: 'disconnected', attempted: false })).toBe(true)
  })

  // The effect used to fire on every isConnected=false, so Disconnect inside
  // MiniPay reconnected immediately and reset the wizard each time.
  it('does not reconnect after the one attempt', () => {
    expect(shouldAutoConnect({ miniPay: true, status: 'disconnected', attempted: true })).toBe(false)
  })

  // A hard load starts disconnected and then runs wagmi's own reconnect. A
  // second connect racing it is two requests to the same wallet.
  it('stays out of wagmi reconnecting and connecting', () => {
    expect(shouldAutoConnect({ miniPay: true, status: 'reconnecting', attempted: false })).toBe(false)
    expect(shouldAutoConnect({ miniPay: true, status: 'connecting', attempted: false })).toBe(false)
  })

  it('never connects outside MiniPay', () => {
    expect(shouldAutoConnect({ miniPay: false, status: 'disconnected', attempted: false })).toBe(false)
  })
})

describe('describeConnectError', () => {
  it('says nothing when there is no error', () => {
    expect(describeConnectError(null)).toBeNull()
    expect(describeConnectError(undefined)).toBeNull()
  })

  // injected() is always in the connector list, so with no extension the
  // button used to reject silently and look broken.
  it('names a missing wallet', () => {
    expect(describeConnectError(new ProviderNotFoundError())).toBe(NO_WALLET)
  })

  it('names a cancelled request, however deep the cause', () => {
    expect(describeConnectError(new UserRejectedRequestError(new Error('no')))).toBe(CONNECT_CANCELLED)
    expect(describeConnectError({ message: 'wrapped', cause: { code: 4001 } })).toBe(CONNECT_CANCELLED)
  })

  // MetaMask's answer to a second click while the first prompt is open.
  it('names a request already open in the wallet', () => {
    expect(describeConnectError({ code: -32002 })).toBe(CONNECT_PENDING)
  })

  it('falls back to a plain failure', () => {
    expect(describeConnectError(new Error('boom'))).toBe(CONNECT_FAILED)
  })

  it('does not loop on a cyclic cause chain', () => {
    const a: { cause?: unknown } = {}
    a.cause = a
    expect(describeConnectError(a)).toBe(CONNECT_FAILED)
  })
})

describe('ConnectButton wiring', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'components/ConnectButton.tsx'), 'utf8')

  it('uses the pure decisions rather than its own', () => {
    expect(source).toContain('shouldAutoConnect(')
    expect(source).toContain('describeConnectError(')
    expect(source).toContain('disabled={isPending}')
  })

  // Calling isMiniPay() in the render body is a hydration mismatch inside
  // MiniPay: the server says false, the client says true.
  it('learns MiniPay in an effect', () => {
    expect(source).toMatch(/useEffect\(\(\) => \{ setMiniPay\(isMiniPay\(\)\) \}, \[\]\)/)
  })

  it('names the disconnect action, starting with the visible text', () => {
    expect(source).toContain('aria-label={`${truncateAddress(address)}, disconnect`}')
  })
})
```

- [x] **Step 2: Run the tests and confirm they fail**

Run: `pnpm -F @leash/app test -- connectWallet`
Expected: FAIL with `Failed to resolve import "../lib/connectWallet.js"`.

- [x] **Step 3: Implement `app/lib/connectWallet.ts`**

```ts
/**
 * What ConnectButton decides, kept out of the component because
 * app/vitest.config.ts runs in the node environment and no component-testing
 * dependency may be added. Same arrangement as lib/writePhase.ts.
 */

/**
 * Whether to connect on the reader's behalf.
 *
 * Only inside MiniPay, where opening the page already chose the wallet, and
 * only once per page: the effect that calls this used to fire on every
 * disconnected render, which made Disconnect inside MiniPay reconnect at once.
 * `status`, not `isConnected`, so it also stays out of wagmi's own reconnect
 * on a hard load.
 */
export function shouldAutoConnect(input: {
  miniPay: boolean
  status: string
  attempted: boolean
}): boolean {
  return input.miniPay && input.status === 'disconnected' && !input.attempted
}

export const NO_WALLET =
  'No browser wallet found. Install one, or open this page in MiniPay, then reload.'
export const CONNECT_CANCELLED = 'The wallet did not connect. The request was cancelled.'
export const CONNECT_PENDING =
  'Your wallet already has a connection request open. Finish it there.'
export const CONNECT_FAILED = 'The wallet did not connect. Try again.'

type Link = { name?: unknown; code?: unknown; cause?: unknown }

/**
 * One sentence for a failed connect, or null when there is no failure.
 *
 * Walks `cause` by hand rather than through viem's BaseError.walk: wagmi's
 * ProviderNotFoundError and a wallet's raw `{ code }` object are not viem
 * errors. Bounded, so a cyclic chain cannot hang the render.
 */
export function describeConnectError(error: unknown): string | null {
  if (error === null || error === undefined) return null
  let link: unknown = error
  for (let depth = 0; depth < 10 && link && typeof link === 'object'; depth++) {
    const { name, code, cause } = link as Link
    if (name === 'ProviderNotFoundError') return NO_WALLET
    if (code === 4001 || name === 'UserRejectedRequestError') return CONNECT_CANCELLED
    if (code === -32002) return CONNECT_PENDING
    link = cause
  }
  return CONNECT_FAILED
}
```

- [x] **Step 4: Rewrite `app/components/ConnectButton.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { isMiniPay } from '../lib/chain.js'
import { truncateAddress } from '../lib/address.js'
import { describeConnectError, shouldAutoConnect } from '../lib/connectWallet.js'
import Button from './ui/Button'
import Label from './ui/Label'

/**
 * `onDangerBand` for the same reason StopButton reads `paused`: on the paused
 * header the ground is --bad, and a --bad note on it is 1.00:1.
 * docs/design-system.md §4.
 */
export default function ConnectButton({ onDangerBand = false }: { onDangerBand?: boolean }) {
  const { address, isConnected, status } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  // Learned after mount: isMiniPay() in the render body is false on the server
  // and true in MiniPay, which is a hydration mismatch.
  const [miniPay, setMiniPay] = useState(false)
  useEffect(() => { setMiniPay(isMiniPay()) }, [])

  // MiniPay users have already chosen their wallet by opening the app there.
  // Once per page -- see shouldAutoConnect.
  const attempted = useRef(false)
  useEffect(() => {
    if (!connectors[0]) return
    if (!shouldAutoConnect({ miniPay, status, attempted: attempted.current })) return
    attempted.current = true
    connect({ connector: connectors[0] })
  }, [miniPay, status, connect, connectors])

  if (isConnected && address) {
    // MiniPay has no "other wallet" to go to, and its injected provider
    // cannot really be disconnected, so the address is a label there.
    if (miniPay) return <Label className="num">{truncateAddress(address)}</Label>
    return (
      <Button
        variant="ghost"
        aria-label={`${truncateAddress(address)}, disconnect`}
        title="Disconnect"
        onClick={() => disconnect()}
      >
        {truncateAddress(address)}
      </Button>
    )
  }

  const note = describeConnectError(error)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="primary"
        disabled={isPending}
        onClick={() => connectors[0] && connect({ connector: connectors[0] })}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </Button>
      {/* Without this, a missing extension or a cancelled prompt looked like a
          button that does nothing. */}
      {note && (
        <Label role="status" style={{ color: onDangerBand ? 'var(--bg)' : 'var(--bad)' }}>
          {note}
        </Label>
      )}
    </span>
  )
}
```

- [x] **Step 5: Pass the band on the dashboard**

In `app/app/a/[address]/page.tsx`, replace `<ConnectButton />` inside the `AppHeader` actions with:

```tsx
            <ConnectButton onDangerBand={state.paused} />
```

- [x] **Step 6: Run the tests and typecheck**

Run: `pnpm -F @leash/app test -- connectWallet && (cd app && npx tsc --noEmit)`
Expected: PASS. tsc prints nothing.

- [x] **Step 7: Commit**

```bash
git add app/lib/connectWallet.ts app/test/connectWallet.test.ts app/components/ConnectButton.tsx "app/app/a/[address]/page.tsx"
git commit -m "fix(app): Connect wallet failed silently and Disconnect did nothing in MiniPay" -m "injected() is always listed, so with no extension the connect rejected and nothing was said, a cancelled prompt read the same way, and a second click opened a second request. The MiniPay auto-connect fired on every disconnected render, so Disconnect reconnected at once and reset the wizard. The button now reports the failure, disables itself while pending, connects inside MiniPay only once and never during wagmi's own reconnect, and names its disconnect action.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `/accounts` runs one discovery per owner (spec §2.5)

**Files:**
- Modify: `app/components/AccountsPage.tsx` (imports, the effect at ~line 107, `discoverAccounts` at ~line 121, the Refresh button at ~line 229)
- Test: `app/test/accountDiscovery.test.ts` (append)

**Interfaces:**
- Produces: `startDiscovery(owner: \`0x${string}\`): void`, local to `AccountsPage`. `discoverAccounts(owner, signal: AbortSignal)`, where `signal` is now required.

- [x] **Step 1: Write the failing ratchet**

Append to `app/test/accountDiscovery.test.ts`. Add the `node:fs`, `node:path` and `node:url` imports at the top if they are not already there.

```ts
/**
 * "Refresh from Celo" used to call discoverAccounts with no signal. A switch
 * of wallet mid-run left it running, and its last act was to write the
 * previous owner's list onto the new owner's screen.
 */
describe('AccountsPage discovery runs', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'components/AccountsPage.tsx'), 'utf8')

  it('are started in one place', () => {
    const calls = source.match(/discoverAccounts\(/g) ?? []
    // The definition, and the single call inside startDiscovery.
    expect(calls).toHaveLength(2)
    expect(source).toMatch(/function startDiscovery\([^)]*\) \{[\s\S]*?\.abort\(\)[\s\S]*?discoverAccounts\(/)
  })

  it('always carry a signal', () => {
    expect(source).toContain('signal: AbortSignal)')
    expect(source).not.toContain('signal?: AbortSignal')
  })

  it('check for replacement before reporting a failed response', () => {
    const body = source.slice(source.indexOf('await response.json()'), source.indexOf('if (!response.ok'))
    expect(body).toContain('if (signal.aborted) return')
  })
})
```

- [x] **Step 2: Run the tests and confirm they fail**

Run: `pnpm -F @leash/app test -- accountDiscovery`
Expected: FAIL. There are three `discoverAccounts(` matches and `signal?: AbortSignal` is present.

- [x] **Step 3: Implement**

In `app/components/AccountsPage.tsx`:

1. Change the React import to `import { useEffect, useRef, useState } from 'react'`.
2. Replace the whole effect that starts with `useEffect(() => {\n    if (!connected) {` and ends with `}, [connected])` with:
   ```tsx
     /**
      * The run in flight, whoever started it. The effect and the Refresh
      * button both go through startDiscovery, so a wallet switch aborts a
      * manual run too -- it used to finish and write the previous owner's
      * list onto this owner's screen.
      */
     const run = useRef<AbortController | null>(null)
     function startDiscovery(owner: `0x${string}`) {
       run.current?.abort()
       const controller = new AbortController()
       run.current = controller
       void discoverAccounts(owner, controller.signal)
     }

     useEffect(() => {
       if (!connected) {
         run.current?.abort()
         setAccounts([])
         setDiscoveryNote(null)
         setUnreadableCount(0)
         setDiscovering(false)
         return
       }
       setAccounts(migrateLegacyAccount(localStorage, connected))
       startDiscovery(connected)
       return () => run.current?.abort()
       // startDiscovery is rebuilt every render and reads only refs and setters.
     }, [connected])
   ```
3. Change the signature to `async function discoverAccounts(owner: \`0x${string}\`, signal: AbortSignal) {`.
4. Directly after the line `const body = await response.json() as { ... }` (after its closing `}`), insert:
   ```ts
         // Replaced while the body was read. Nothing below is about this owner.
         if (signal.aborted) return
   ```
5. Replace every remaining `signal?.aborted` in the function with `signal.aborted`.
6. Change the Refresh button's handler to:
   ```tsx
   onClick={() => startDiscovery(connected!)}
   ```

- [x] **Step 4: Run the tests and typecheck**

Run: `pnpm -F @leash/app test -- accountDiscovery && (cd app && npx tsc --noEmit)`
Expected: PASS. tsc prints nothing.

- [x] **Step 5: Commit**

```bash
git add app/components/AccountsPage.tsx app/test/accountDiscovery.test.ts
git commit -m "fix(app): Refresh from Celo could show the previous wallet's accounts" -m "The manual refresh ran without an abort signal, so a wallet switch mid-run left it going, and it ended by listing the old owner's registry under the new owner. Both the effect and the button now start runs through one function that aborts the one before, and a run replaced while reading its response writes nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: A dashboard write in flight outlives the owner check (spec §2.6)

**Files:**
- Modify: `app/lib/writePhase.ts` (append)
- Modify: `app/components/StopButton.tsx`
- Modify: `app/components/LimitsDrawer.tsx`
- Modify: `app/app/a/[address]/page.tsx` (~lines 250 and 344)
- Test: `app/test/writePhase.test.ts` (append)

**Interfaces:**
- Consumes: `isBusy`, `writeLabel`, `WritePhase` from `app/lib/writePhase.ts`; `truncateAddress` from `app/lib/address.ts`
- Produces: `export type OwnerControlView = 'controls' | 'pending' | 'outcome' | 'hidden'`, `export function ownerControlView(isOwner: boolean, phases: readonly WritePhase[], note: string | null): OwnerControlView`, `export function outcomeForOtherWallet(note: string, sender: string | null): string`. `LimitsDrawer` gains the required prop `isOwner: boolean`.

- [x] **Step 1: Write the failing tests**

Add `ownerControlView, outcomeForOtherWallet` to the import from `'../lib/writePhase.js'` in `app/test/writePhase.test.ts`. Ensure `readFileSync`, `join` and `fileURLToPath` are imported, adding them if missing. Append:

```ts
/**
 * LimitsDrawer and StopButton were mounted only while isOwner held. A
 * disconnect or an account switch during pollUntil unmounted them, and the
 * one message that said whether a real transaction landed went with them.
 */
describe('ownerControlView', () => {
  it('gives the owner the controls', () => {
    expect(ownerControlView(true, ['idle'], null)).toBe('controls')
    expect(ownerControlView(true, ['confirming'], 'x')).toBe('controls')
  })

  it('keeps a write in flight on screen after the owner has gone', () => {
    expect(ownerControlView(false, ['idle', 'confirming'], null)).toBe('pending')
    expect(ownerControlView(false, ['sending'], 'old note')).toBe('pending')
  })

  it('keeps its outcome on screen', () => {
    expect(ownerControlView(false, ['idle'], 'Sent, but the chain has not confirmed it yet.')).toBe('outcome')
  })

  it('shows nothing to a non-owner otherwise', () => {
    expect(ownerControlView(false, ['idle', 'idle'], null)).toBe('hidden')
  })
})

describe('outcomeForOtherWallet', () => {
  // The walletNote.ts rule: a message about one wallet says which.
  it('names the wallet the outcome is about', () => {
    expect(outcomeForOtherWallet('The transaction was not sent.', '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'))
      .toBe('0x2B33…4f57: The transaction was not sent.')
  })

  it('falls back to the bare note when the sender is unknown', () => {
    expect(outcomeForOtherWallet('x', null)).toBe('x')
  })
})

describe('owner controls are not unmounted by the page', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const page = readFileSync(join(ROOT, 'app/a/[address]/page.tsx'), 'utf8')

  it('renders StopButton and LimitsDrawer without an isOwner guard', () => {
    expect(page).not.toMatch(/isOwner && \(\s*<StopButton/)
    expect(page).not.toMatch(/isOwner && \(\s*<LimitsDrawer/)
  })

  for (const file of ['components/StopButton.tsx', 'components/LimitsDrawer.tsx']) {
    it(`${file} decides with ownerControlView, after its last hook`, () => {
      const source = readFileSync(join(ROOT, file), 'utf8')
      const at = source.indexOf('ownerControlView(')
      expect(at).toBeGreaterThan(-1)
      expect(at).toBeGreaterThan(source.lastIndexOf('useEffect('))
      expect(at).toBeGreaterThan(source.lastIndexOf('useWriteContract('))
    })
  }
})
```

Check the expected string against `truncateAddress` in `app/lib/address.ts:12` before you run the tests. If its format differs from `0x2B33…4f57`, change the expected string to match that function's output. Do not change the function.

- [x] **Step 2: Run the tests and confirm they fail**

Run: `pnpm -F @leash/app test -- writePhase`
Expected: FAIL. The functions are missing and the page still has both guards.

- [x] **Step 3: Implement the helpers**

Append to `app/lib/writePhase.ts`, and add `import { truncateAddress } from './address.js'` at the top:

```ts
export type OwnerControlView = 'controls' | 'pending' | 'outcome' | 'hidden'

/**
 * What an owner-only control shows, given who is connected now.
 *
 * Ownership can end mid-write: a disconnect, or an account switch in the
 * wallet, while pollUntil is still waiting. The control must not offer its
 * buttons to a non-owner -- the write would revert and be paid for -- and it
 * must not vanish either, because it holds the only account of a transaction
 * that was really sent. So a non-owner sees the wait and then the outcome,
 * and never a button.
 */
export function ownerControlView(
  isOwner: boolean,
  phases: readonly WritePhase[],
  note: string | null,
): OwnerControlView {
  if (isOwner) return 'controls'
  if (phases.some(isBusy)) return 'pending'
  if (note !== null) return 'outcome'
  return 'hidden'
}

/** An outcome shown after its wallet has gone says which wallet it is about. */
export function outcomeForOtherWallet(note: string, sender: string | null): string {
  return sender ? `${truncateAddress(sender)}: ${note}` : note
}
```

- [x] **Step 4: Update `StopButton`**

In `app/components/StopButton.tsx`:

1. Change the imports:
   ```ts
   import { useRef, useState } from 'react'
   ```
   and
   ```ts
   import { isBusy, outcomeForOtherWallet, ownerControlView, writeLabel, type WritePhase } from '../lib/writePhase.js'
   ```
2. Replace `const { chainId } = useAccount()` with:
   ```ts
     const { address: connected, chainId } = useAccount()
     // Who pressed, for an outcome that arrives after they have gone.
     const sender = useRef<string | null>(null)
   ```
3. Replace the line `  if (!isOwner) {` with:
   ```tsx
     const view = ownerControlView(isOwner, [phase], note)
     if (view === 'pending' || view === 'outcome') {
       // No button in either: the wallet connected now does not own this
       // account, and a Stop it sent would revert and be paid for.
       return (
         <Label role="status" style={{ color: paused ? 'var(--bg)' : 'var(--bad)' }}>
           {view === 'pending'
             ? writeLabel(phase, { idle: '', sending: 'Waiting for the wallet…' })
             : outcomeForOtherWallet(note ?? '', sender.current)}
         </Label>
       )
     }
     if (view === 'hidden') {
   ```
   Leave the body of that block, the existing `Paused` / `Active` label and its comments, unchanged.
4. In `send`, directly after `setNote(null)`, add:
   ```ts
       sender.current = connected ?? null
   ```

- [x] **Step 5: Update `LimitsDrawer`**

In `app/components/LimitsDrawer.tsx`:

1. Change the writePhase import to:
   ```ts
   import { isBusy, outcomeForOtherWallet, ownerControlView, writeLabel, type WritePhase } from '../lib/writePhase.js'
   ```
   and change `import { useEffect, useState } from 'react'` to `import { useEffect, useRef, useState } from 'react'`.
2. Add `isOwner` to the destructured props, after `onSaved`, and to the prop type as `isOwner: boolean`.
3. Replace `const { chainId } = useAccount()` with:
   ```ts
     const { address: connected, chainId } = useAccount()
     const sender = useRef<string | null>(null)
   ```
4. Add `sender.current = connected ?? null` directly after the first line of each of these three write functions: `setError(null)` in `saveLimits` (~line 104), and `setRecipientNote(null)` in `setRecipientProtection` (~line 138) and in `setPayeeAccess` (~line 187). Leave `checkPayee` alone, because it is a read.
5. Immediately above the component's `  return (` (currently line 257, directly after the Escape-key `useEffect`), insert:
   ```tsx
     const view = ownerControlView(isOwner, [phase, recipientPhase], error ?? recipientNote)
     if (view === 'hidden') return null
     if (view !== 'controls') {
       // The drawer's buttons are not safe for a wallet that does not own the
       // account; its outcome is still owed to whoever pressed. See
       // ownerControlView.
       const busyPhase = isBusy(phase) ? phase : recipientPhase
       return (
         <Panel className="p-6">
           <p role="status" className="text-sm" style={{ color: 'var(--dim)' }}>
             {view === 'pending'
               ? writeLabel(busyPhase, { idle: '', sending: 'Waiting for the wallet…' })
               : outcomeForOtherWallet(error ?? recipientNote ?? '', sender.current)}
           </p>
         </Panel>
       )
     }
   ```

- [x] **Step 6: Remove the page guards**

In `app/app/a/[address]/page.tsx`:

1. Replace
   ```tsx
               {isOwner && (
                 <StopButton
                   account={address}
                   paused={state.paused}
                   isOwner={isOwner}
                   loading={state.isLoading}
                   onChanged={state.refetch}
                 />
               )}
   ```
   with
   ```tsx
               {/* Not gated here: an unmount mid-write lost the only message
                   saying whether setPaused landed. StopButton gates itself. */}
               <StopButton
                 account={address}
                 paused={state.paused}
                 isOwner={isOwner}
                 loading={state.isLoading}
                 onChanged={state.refetch}
               />
   ```
2. Replace the `{isOwner && (\n                <LimitsDrawer` block with an unguarded `<LimitsDrawer ... />` that keeps every existing prop and adds `isOwner={isOwner}`. Put the same one-line comment above it.

- [x] **Step 7: Run the full app suite, typecheck and e2e**

Run: `pnpm -F @leash/app test && (cd app && npx tsc --noEmit) && pnpm -F @leash/app test:e2e`
Expected: every vitest test PASSES, tsc prints nothing, and every Playwright spec PASSES. `e2e/dashboard.spec.ts` still finds `Connect wallet`. A visitor now also sees `Active` or `Paused` in the header; this is deliberate (spec §2.6).

- [x] **Step 8: Commit**

```bash
git add app/lib/writePhase.ts app/test/writePhase.test.ts app/components/StopButton.tsx app/components/LimitsDrawer.tsx "app/app/a/[address]/page.tsx"
git commit -m "fix(app): a wallet switch mid-write unmounted the only message about that write" -m "The dashboard mounted StopButton and LimitsDrawer only while isOwner held, so a disconnect or an account switch during pollUntil removed them, and nothing ever said whether setPaused or setPolicy landed. Both are now always mounted and gate themselves: a non-owner sees the wait, then the outcome labelled with the wallet that sent it, and never a button. A visitor now also sees the Active/Paused label that StopButton was written to show them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Manual verification in a browser wallet (spec §3)

No automated test in this repo can drive an injected wallet. This task writes nothing to the repo unless something fails.

- [x] **Step 1: Start the app**

Run: `pnpm -F @leash/app dev`, then open `http://localhost:3000` in a browser that has a wallet extension holding two accounts, A and B. A owns a Leash account.

- [x] **Step 2: Check each item and record what was seen**

| Check | Steps | Expected |
|---|---|---|
| §2.2 | `/setup` as A → step 3 → Generate agent wallet → switch the extension to B | The key panel disappears. Switch back to A: the wizard re-runs the restore effect, so it returns to the stage Celo says A is at, and the key is shown again **only if** the agent it controls is one `operators()` reports as authorised — an unauthorised generated agent must be generated again (spec §2.2, corrected in cb95ebf). Press the address button to disconnect: the key does not come back after reconnecting A. |
| §2.3 | As B, open `/setup` after putting A's account address in `localStorage['leash.account']` and B in `localStorage['leash.accountOwner']` | Stage 1, with `The connected wallet does not own this protected account…` |
| §2.4 | Disable the extension and reload `/accounts` → Connect wallet | `No browser wallet found…`. Re-enable it, press Connect and cancel in the wallet: `…The request was cancelled.` Press twice quickly: the button reads `Connecting…` and is disabled. |
| §2.5 | `/accounts` as A → Refresh from Celo → switch to B at once | Only B's accounts, or B's empty state. A's addresses never appear. |
| §2.6 | Read-only check: on A's dashboard, switch to B | The Stop button and Protection drawer disappear, and the header shows `Active`. The in-flight half is checked only if the maintainer chooses to send one real `setPaused`. |

- [x] **Step 3: Report**

For each row, report what was actually seen. If a row fails, go back to its task with superpowers:systematic-debugging, and do not mark it done.
