# Leash Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Leash web app — a dashboard that shows an agent's on-chain
allowance in real time and an onboarding flow that ends with a filled-in
`.mcp.json` — plus the one-line contract fix and the demo agent.

**Architecture:** Next.js App Router reading Celo directly through viem. No
backend and no database: the allowance meter comes from two view calls and is
authoritative; the feed comes from event logs and is best-effort. `/a/<address>`
renders fully without a wallet, so the demo link works for anyone; connecting a
wallet only unlocks owner-gated writes.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind 3.4,
wagmi 2, viem 2, TanStack Query 5, Vitest 2, Playwright 1.49, Foundry.

**Spec:** `docs/superpowers/specs/2026-09-03-leash-frontend-design.md`
(supplements `docs/superpowers/specs/2026-09-01-leash-design.md`, still binding
for everything the newer document does not touch)

## Global Constraints

- **Every string the app renders is English.** Spec §1.6.
- **Never hardcode a fee adapter from memory.** Use `KNOWN_FEE_ADAPTERS` from
  `@leash/sdk` — that list was discovered on-chain by `spikes/fee-currency.ts`
  and is marked "Do not edit by hand" — and assert at runtime that the chosen
  adapter appears in the directory's live `getCurrencies()`. Spec §2.5 of
  2026-09-01.
- **The app never asks for a private key, at any step.** `OPERATOR_PK` stays a
  placeholder in the generated `.mcp.json`. Spec §5.1.
- **After any write, wait on the condition, never on the receipt.** forno is
  load-balanced and serves stale reads after a confirmed transaction. Poll the
  value that changed until it changes.
- **Never read `limits().spentToday` directly.** The contract only resets it
  inside `_consume()`, so it is stale once the UTC day rolls over. Derive
  `spent = daily − remainingToday()`.
- **Always send an explicit gas limit on any transaction this repo signs.**
  Without one, a `feeCurrency` transaction reserves `blockGasLimit * gasPrice` —
  measured at 0.465 USDC against ~0.0022 actually spent. The app itself signs
  nothing (users sign in their own wallet), but `examples/` does: reuse the
  SDK's `LeashClient`, which already sets `GAS_LIMIT = 300_000n`.
- **viem must resolve to one copy.** `app/` pins the same viem major as
  `sdk/package.json` (`viem ^2.21.0`). Two copies in one bundle break `viem`
  type identity and wagmi's client.
- **Colours come only from the tokens in Task 3.** No component hardcodes a hex.
- **`--celo` must be read from Celo's brand kit and never guessed** (Task 3,
  Step 1). Spec §1.4.
- Node 20 (`.nvmrc`), pnpm 9.12.0, workspace already lists `app`.

---

## File Structure

**Contract (Task 1)**
- Modify `contracts/src/SpendPolicyAccount.sol` — delete `receive()`.
- Create `contracts/test/NativeValue.t.sol` — asserts a plain CELO send reverts.

**App — pure logic, unit-tested, no React and no network (Tasks 3, 6, 7)**
- `app/lib/policy.ts` — allowance arithmetic and amount formatting.
- `app/lib/address.ts` — address validation and truncation.
- `app/lib/feed.ts` — turns a decoded log into a display row.
- `app/lib/mcpJson.ts` — generates the handoff block.
- `app/lib/gasFloat.ts` — operator float to "about N transactions left".

These are split by responsibility rather than layer so each stays small enough
to hold in context, and so every one of them is testable without a wallet.

**App — chain access (Tasks 2, 4)**
- `app/lib/chain.ts` — the shared viem public client and wagmi config.
- `app/lib/useAccountState.ts` — polls `remainingToday` / `limits` / `paused`.
- `app/lib/useFeed.ts` — chunked `getLogs` plus `watchContractEvent`.

**App — UI (Tasks 2–7)**
- `app/app/layout.tsx`, `app/app/globals.css` — shell and design tokens.
- `app/app/page.tsx` — Onboard.
- `app/app/a/[address]/page.tsx` — Dashboard.
- `app/components/Meter.tsx` — the signature turbulence meter.
- `app/components/Feed.tsx`, `app/components/LimitsDrawer.tsx`,
  `app/components/StopButton.tsx`, `app/components/AgentPanel.tsx`,
  `app/components/ConnectButton.tsx`, `app/components/McpHandoff.tsx`.

**Demo (Task 8)**
- `examples/demo-agent.ts`, `examples/README.md`.

---

## Task 1: Contract — remove `receive()`, redeploy, migrate the demo instance

Spec §6. This runs **first**: every later task points at the new address, and it
must be done before filming.

**Files:**
- Modify: `contracts/src/SpendPolicyAccount.sol` (last line)
- Create: `contracts/test/NativeValue.t.sol`
- Modify: `docs/deployments.md`
- Modify: `.env` (local only, never committed)

**Interfaces:**
- Consumes: nothing.
- Produces: a new `SpendPolicyAccount` address on Celo mainnet, written to
  `.env` as `LEASH_ACCOUNT` and recorded in `docs/deployments.md`. Every later
  task reads that address from those two places.

- [ ] **Step 1: Write the failing test**

Create `contracts/test/NativeValue.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";

contract NativeValueTest is Test {
    SpendPolicyAccount account;
    address owner = address(0xA11CE);

    function setUp() public {
        account = new SpendPolicyAccount(owner);
    }

    /// CELO sent here would be unreachable: sweep() moves ERC-20 only and
    /// there is no call{value:} anywhere in the contract. Refusing the
    /// transfer is what keeps a user who was told to "fund your account"
    /// from losing it permanently.
    function test_plainCeloSendReverts() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(account).call{value: 1 ether}("");
        assertFalse(ok, "contract must refuse native value");
        assertEq(address(account).balance, 0);
    }

    /// A call with an unknown selector must also revert: there is no
    /// fallback, and adding one later would reopen the same trap.
    function test_unknownSelectorReverts() public {
        (bool ok,) = address(account).call(abi.encodeWithSignature("nope()"));
        assertFalse(ok, "contract must have no fallback");
    }
}
```

- [ ] **Step 2: Run it and watch the first test fail**

```bash
cd contracts && forge test --match-contract NativeValueTest -vv
```

Expected: `test_plainCeloSendReverts` FAILS (`receive()` currently accepts the
value, so `ok` is true). `test_unknownSelectorReverts` already passes — there is
no fallback today, and this test exists to keep it that way.

- [ ] **Step 3: Delete `receive()`**

In `contracts/src/SpendPolicyAccount.sol`, delete these two lines at the end of
the contract:

```solidity
    receive() external payable {}
```

Leave everything else untouched. This is the whole change.

- [ ] **Step 4: Run the full contract suite**

```bash
cd contracts && forge test
```

Expected: 32 passed, 0 failed. The 30 existing tests must all still pass; the
two new ones bring the total to 32.

- [ ] **Step 5: Commit the contract change**

```bash
git add contracts/src/SpendPolicyAccount.sol contracts/test/NativeValue.t.sol
git commit -m "fix(contracts): refuse native value, or CELO sent here is lost

sweep() moves ERC-20 only and nothing in the contract can call{value:},
so anything receive() accepted was unreachable forever. Removing it makes
the send revert instead. A second test pins the absence of a fallback,
since adding one would reopen the same trap."
```

- [ ] **Step 6: Deploy the new instance**

```bash
cd contracts
set -a && . ../.env && set +a
forge script script/Deploy.s.sol:Deploy \
  --rpc-url celo --broadcast --verify --private-key "$OWNER_PK"
```

`Deploy.s.sol` reads `OWNER` and `OPERATOR` from the environment and calls
`setOperator` for you. Record the printed address as `$NEW`.

Expected: a deployed address, `owner()` equal to `$OWNER`, `operators($OPERATOR)`
true, and verification submitted through the Etherscan V2 endpoint pinned in
`foundry.toml`.

- [ ] **Step 7: Confirm the deployment against the chain, not the deploy output**

```bash
cast call $NEW "owner()(address)"              --rpc-url celo
cast call $NEW "operators(address)(bool)" $OPERATOR --rpc-url celo
cast call $NEW "paused()(bool)"                --rpc-url celo
```

Expected: the owner address, `true`, `false`. If `--verify` did not confirm,
re-run verification alone:

```bash
forge verify-contract $NEW src/SpendPolicyAccount.sol:SpendPolicyAccount \
  --chain 42220 --constructor-args $(cast abi-encode "c(address)" $OWNER)
```

- [ ] **Step 8: Migrate the money and the policy**

```bash
# 1. move the USDC out of the old account
cast send $LEASH_ACCOUNT "sweep(address,address,uint256)" \
  $SPEND_TOKEN $NEW $(cast call $LEASH_ACCOUNT \
    "balanceOf(address)(uint256)" --rpc-url celo 2>/dev/null || echo 0) \
  --rpc-url celo --private-key "$OWNER_PK"

# the balance above must come from the token, not the account:
cast call $SPEND_TOKEN "balanceOf(address)(uint256)" $LEASH_ACCOUNT --rpc-url celo

# 2. set the policy on the new account (0.50 per tx, 1.00 per day, 6 decimals)
cast send $NEW "setPolicy(address,uint256,uint256)" $SPEND_TOKEN 500000 1000000 \
  --rpc-url celo --private-key "$OWNER_PK"
```

Then **wait on the condition, not the receipt** — forno will serve a stale read
after a confirmed transaction:

```bash
until [ "$(cast call $NEW 'remainingToday(address)(uint256)' $SPEND_TOKEN --rpc-url celo)" != "0" ]; do
  echo "waiting for policy to be readable…"; sleep 3
done
cast call $SPEND_TOKEN "balanceOf(address)(uint256)" $NEW --rpc-url celo
```

- [ ] **Step 9: Point `.env` at the new account**

Set `LEASH_ACCOUNT=$NEW` in `.env`. Change nothing else — the operator EOA does
not move, so the ERC-8004 registration (agentId 9804) and x402 attribution are
unaffected. `.env` is gitignored; do not commit it.

- [ ] **Step 10: Prove the MCP server still works against the new address**

```bash
cd mcp && pnpm run test
cd ../sdk && pnpm run test
```

Expected: 12/12 and 42/42. These are unit suites and do not touch the chain, but
they must stay green before the gate tests are trusted.

- [ ] **Step 11: Update the deployment record**

In `docs/deployments.md`, add the new instance with its address, deploy tx,
verification status, cost and date. Mark
`0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` **superseded 2026-09-03 — accepted
native value, which was unrecoverable**, and keep its record and every existing
proof transaction. They are still true history.

- [ ] **Step 12: Commit the record**

```bash
git add docs/deployments.md
git commit -m "docs: record the redeploy, and supersede the old instance

The old address stays in the record with its proof transactions: they
happened. It is marked superseded rather than deleted because the code it
runs is not the code users are now given."
```

---

## Task 2: App scaffold, workspace wiring, and the MiniPay-aware connector

Spec §2.1. Ends with a page that renders and a connect button that works.

**Files:**
- Create: `app/package.json`, `app/next.config.ts`, `app/tsconfig.json`,
  `app/tailwind.config.ts`, `app/postcss.config.mjs`, `app/vitest.config.ts`
- Create: `app/lib/chain.ts`, `app/components/ConnectButton.tsx`
- Create: `app/app/layout.tsx`, `app/app/page.tsx`, `app/app/globals.css`
- Create: `app/lib/address.ts`, `app/test/address.test.ts`

**Interfaces:**
- Consumes: `LEASH_ACCOUNT` from Task 1 (only as a default demo link).
- Produces:
  - `app/lib/chain.ts` exports `publicClient` (a viem client on `celo` over
    `NEXT_PUBLIC_CELO_RPC_URL`, defaulting to `https://forno.celo.org`) and
    `wagmiConfig`.
  - `app/lib/address.ts` exports
    `isValidAddress(s: string): s is \`0x${string}\`` and
    `truncateAddress(a: string): string`.
  - `app/components/ConnectButton.tsx` default-exports `<ConnectButton />`.

- [ ] **Step 1: Create the package manifest**

Create `app/package.json`:

```json
{
  "name": "@leash/app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@leash/sdk": "workspace:*",
    "@tanstack/react-query": "^5.60.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "viem": "^2.21.0",
    "wagmi": "^2.14.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Install and confirm one viem**

```bash
cd /Users/vanhuy/Desktop/celo && pnpm install
pnpm why viem | grep -c "viem 2" || true
node -e "console.log(require.resolve('viem'))" 2>/dev/null || true
```

Expected: install succeeds. If more than one viem 2.x version appears, pin
`app`'s viem to the exact version `sdk` resolved before continuing — two copies
break wagmi's client typing at build time, not at review time.

- [ ] **Step 3: Configure Next, TypeScript, Tailwind, Vitest**

Create `app/next.config.ts`:

```ts
import type { NextConfig } from 'next'

// @leash/sdk ships raw TypeScript (its package main is src/index.ts), so Next
// has to compile it rather than treat it as a built dependency.
const config: NextConfig = {
  transpilePackages: ['@leash/sdk'],
}

export default config
```

Create `app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `app/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

Create `app/postcss.config.mjs`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } }
```

Create `app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node' } })
```

- [ ] **Step 4: Write the failing test for the address helpers**

Create `app/test/address.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isValidAddress, truncateAddress } from '../lib/address.js'

describe('isValidAddress', () => {
  it('accepts a checksummed address', () => {
    expect(isValidAddress('0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57')).toBe(true)
  })

  it('accepts an all-lowercase address', () => {
    expect(isValidAddress('0x2b33cb68c4d826a4fc36264bcdb46081c99f4f57')).toBe(true)
  })

  it('rejects a string that is too short', () => {
    expect(isValidAddress('0x2B33cb68')).toBe(false)
  })

  it('rejects a 64-hex private key, which must never be pasted here', () => {
    expect(isValidAddress('0x' + 'a'.repeat(64))).toBe(false)
  })
})

describe('truncateAddress', () => {
  it('keeps the first six and last four characters', () => {
    expect(truncateAddress('0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'))
      .toBe('0x2B33…4f57')
  })

  it('returns a short string unchanged rather than mangling it', () => {
    expect(truncateAddress('0x2B33')).toBe('0x2B33')
  })
})
```

- [ ] **Step 5: Run it and verify it fails**

```bash
cd app && pnpm vitest run test/address.test.ts
```

Expected: FAIL — `Failed to resolve import "../lib/address.js"`.

- [ ] **Step 6: Implement the address helpers**

Create `app/lib/address.ts`:

```ts
import { isAddress } from 'viem'

export function isValidAddress(s: string): s is `0x${string}` {
  return isAddress(s)
}

/**
 * Shortens an address for display. Deliberately keeps six leading characters:
 * four is not enough to tell two accounts apart at a glance, and this string
 * appears next to money.
 */
export function truncateAddress(a: string): string {
  if (a.length <= 12) return a
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}
```

- [ ] **Step 7: Run the test and verify it passes**

```bash
cd app && pnpm vitest run test/address.test.ts
```

Expected: 6 passed.

- [ ] **Step 8: Create the chain client and wagmi config**

Create `app/lib/chain.ts`:

```ts
import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { createConfig, injected } from 'wagmi'

export const RPC_URL =
  process.env.NEXT_PUBLIC_CELO_RPC_URL ?? 'https://forno.celo.org'

/** Read path. Used by every page, including with no wallet connected. */
export const publicClient = createPublicClient({
  chain: celo,
  transport: http(RPC_URL),
})

/**
 * Injected only, and no wallet-selection modal.
 *
 * MiniPay is an in-app browser that injects window.ethereum itself; a modal
 * asking which wallet to use is both wrong there and a recognisable template
 * everywhere else.
 */
export const wagmiConfig = createConfig({
  chains: [celo],
  connectors: [injected()],
  transports: { [celo.id]: http(RPC_URL) },
})

/** True inside the MiniPay in-app browser, which auto-connects. */
export function isMiniPay(): boolean {
  if (typeof window === 'undefined') return false
  const eth = (window as { ethereum?: { isMiniPay?: boolean } }).ethereum
  return Boolean(eth?.isMiniPay)
}
```

- [ ] **Step 9: Build the connect button and the app shell**

Create `app/components/ConnectButton.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { isMiniPay } from '../lib/chain.js'
import { truncateAddress } from '../lib/address.js'

export default function ConnectButton() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  // MiniPay users have already chosen their wallet by opening the app there.
  useEffect(() => {
    if (!isConnected && isMiniPay() && connectors[0]) {
      connect({ connector: connectors[0] })
    }
  }, [isConnected, connect, connectors])

  if (isConnected && address) {
    return (
      <button className="btn-ghost" onClick={() => disconnect()}>
        {truncateAddress(address)}
      </button>
    )
  }

  return (
    <button
      className="btn-primary"
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
    >
      Connect wallet
    </button>
  )
}
```

Create `app/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'

export const metadata: Metadata = {
  title: 'Leash',
  description: 'Give an AI agent a wallet without trusting it.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

Create `app/app/providers.tsx`:

```tsx
'use client'

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { wagmiConfig } from '../lib/chain.js'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
```

Create `app/app/globals.css` with only the Tailwind directives for now — Task 3
replaces its contents with the design system:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Create a placeholder `app/app/page.tsx`, replaced in Task 6:

```tsx
import ConnectButton from '../components/ConnectButton'

export default function Home() {
  return (
    <main>
      <h1>Leash</h1>
      <ConnectButton />
    </main>
  )
}
```

- [ ] **Step 10: Verify the app builds and typechecks**

```bash
cd app && pnpm run typecheck && pnpm run build
```

Expected: `tsc` exits 0 and `next build` completes. If `next build` complains
about `@leash/sdk`, confirm `transpilePackages` is set.

- [ ] **Step 11: Commit**

```bash
git add app pnpm-lock.yaml
git commit -m "feat(app): scaffold, and an injected-only connector

No RainbowKit: its modal is a recognisable template and it fights
MiniPay's auto-connect. MiniPay injects window.ethereum with an isMiniPay
flag, so there is exactly one right connector there and no choice to
offer."
```

---

## Task 3: Design system and the signature meter

Spec §1.3, §1.5, §3. `T5.0` — runs before any screen, so later screens consume
tokens instead of repainting three times.

**Files:**
- Create: `app/lib/policy.ts`, `app/test/policy.test.ts`
- Modify: `app/app/globals.css`
- Create: `app/components/Meter.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, from `app/lib/policy.ts`:
  - `spentToday(daily: bigint, remaining: bigint): bigint`
  - `percentUsed(daily: bigint, remaining: bigint): number` — 0 to 100
  - `refusalThreshold(remaining: bigint, perTx: bigint): bigint`
  - `formatAmount(value: bigint, decimals: number, places?: number): string`
  - `parseAmount(input: string, decimals: number): bigint` — throws `RangeError`
    on a non-decimal or negative input
- Produces `app/components/Meter.tsx`, default-exporting
  `<Meter daily={bigint} remaining={bigint} perTx={bigint} decimals={number}
  symbol={string} paused={boolean} />`.

- [ ] **Step 1: Get the real Celo yellow before writing any colour**

Open Celo's brand kit and read the exact hex for the brand yellow. **Do not
guess it and do not take it from memory** — spec §1.4 forbids both. Write the
value you found into `app/app/globals.css` as `--celo` in Step 5, and note the
source URL in a comment beside it.

- [ ] **Step 2: Write the failing tests for the allowance arithmetic**

Create `app/test/policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  spentToday, percentUsed, refusalThreshold, formatAmount, parseAmount,
} from '../lib/policy.js'

const USDC = 6

describe('spentToday', () => {
  it('is the difference between the cap and what is left', () => {
    expect(spentToday(1_000_000n, 980_773n)).toBe(19_227n)
  })

  it('is zero when nothing has been spent', () => {
    expect(spentToday(1_000_000n, 1_000_000n)).toBe(0n)
  })

  it('never goes negative if a read returns more than the cap', () => {
    expect(spentToday(1_000_000n, 1_200_000n)).toBe(0n)
  })
})

describe('percentUsed', () => {
  it('reports the fraction consumed', () => {
    expect(percentUsed(1_000_000n, 500_000n)).toBe(50)
  })

  it('is 100 when the allowance is exhausted', () => {
    expect(percentUsed(1_000_000n, 0n)).toBe(100)
  })

  // An unconfigured token has daily == 0, which is the contract's sentinel.
  // Dividing by it would produce NaN and render as "NaN%" next to money.
  it('is 0 for an unconfigured token rather than NaN', () => {
    expect(percentUsed(0n, 0n)).toBe(0)
  })
})

describe('refusalThreshold', () => {
  it('is the per-transaction cap while the daily allowance is ample', () => {
    expect(refusalThreshold(980_773n, 500_000n)).toBe(500_000n)
  })

  it('is the remaining allowance once that is the tighter limit', () => {
    expect(refusalThreshold(90_000n, 500_000n)).toBe(90_000n)
  })

  it('is zero when the allowance is spent', () => {
    expect(refusalThreshold(0n, 500_000n)).toBe(0n)
  })
})

describe('formatAmount', () => {
  it('renders six-decimal units in full', () => {
    expect(formatAmount(980_773n, USDC)).toBe('0.980773')
  })

  it('pads so the column does not jitter as values update', () => {
    expect(formatAmount(1_000_000n, USDC)).toBe('1.000000')
  })

  it('honours a shorter requested precision', () => {
    expect(formatAmount(980_773n, USDC, 2)).toBe('0.98')
  })
})

describe('parseAmount', () => {
  it('converts human units to atomic units', () => {
    expect(parseAmount('0.50', USDC)).toBe(500_000n)
  })

  it('accepts a whole number', () => {
    expect(parseAmount('1', USDC)).toBe(1_000_000n)
  })

  it('rejects a negative amount', () => {
    expect(() => parseAmount('-1', USDC)).toThrow(RangeError)
  })

  it('rejects text', () => {
    expect(() => parseAmount('abc', USDC)).toThrow(RangeError)
  })

  // More precision than the token has would silently truncate the user's
  // money. Refuse instead.
  it('rejects more decimal places than the token supports', () => {
    expect(() => parseAmount('0.1234567', USDC)).toThrow(RangeError)
  })
})
```

- [ ] **Step 3: Run and verify it fails**

```bash
cd app && pnpm vitest run test/policy.test.ts
```

Expected: FAIL — `Failed to resolve import "../lib/policy.js"`.

- [ ] **Step 4: Implement the arithmetic**

Create `app/lib/policy.ts`:

```ts
import { formatUnits, parseUnits } from 'viem'

/**
 * What the agent has spent today.
 *
 * Derived rather than read: the contract's `limits().spentToday` is only
 * reset inside `_consume()`, so it is stale after a UTC day rolls over until
 * the next spend. `remainingToday()` does the day comparison itself, which
 * makes this subtraction correct at every moment.
 */
export function spentToday(daily: bigint, remaining: bigint): bigint {
  return remaining >= daily ? 0n : daily - remaining
}

export function percentUsed(daily: bigint, remaining: bigint): number {
  if (daily === 0n) return 0
  const used = spentToday(daily, remaining)
  return Number((used * 10_000n) / daily) / 100
}

/**
 * The largest amount that would still be accepted right now — the tighter of
 * the two caps. This is what the meter states before money moves, since a
 * refusal is a staticcall and never becomes a transaction to show afterwards.
 */
export function refusalThreshold(remaining: bigint, perTx: bigint): bigint {
  return remaining < perTx ? remaining : perTx
}

export function formatAmount(value: bigint, decimals: number, places = decimals): string {
  const full = formatUnits(value, decimals)
  const [whole, fraction = ''] = full.split('.')
  return places === 0 ? whole : `${whole}.${fraction.padEnd(places, '0').slice(0, places)}`
}

export function parseAmount(input: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(input.trim())) {
    throw new RangeError(`"${input}" is not a positive decimal amount`)
  }
  const [, fraction = ''] = input.trim().split('.')
  if (fraction.length > decimals) {
    throw new RangeError(`more than ${decimals} decimal places would be truncated`)
  }
  return parseUnits(input.trim(), decimals)
}
```

- [ ] **Step 5: Run and verify it passes**

```bash
cd app && pnpm vitest run test/policy.test.ts
```

Expected: 17 passed.

- [ ] **Step 6: Write the design tokens**

Replace the contents of `app/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * Cafe Terrace at Night. Painterly in the chrome, clinical in the data:
 * the ground and the borders carry the reference, the numerals never do.
 * Spec 2026-09-03 section 3.
 */
:root {
  --bg: #0E1F2E;
  --panel: #162D40;
  --well: #091822;
  --line: rgba(214, 190, 140, 0.22);
  --text: #F2E9D8;
  --dim: #8FA6B5;
  --amber: #F2B441;
  /* Celo brand yellow. Read from Celo's brand kit — see Task 3 Step 1.
     Replace this line with the verified value and record the source URL. */
  --celo: #FCFF52;
  --ok: #5FA98C;
  --bad: #D9534F;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

/* Money is always mono and always tabular, so digits do not change width
   as values update live. */
.num {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}

.label {
  font-size: 0.6875rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dim);
}

.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}

.btn-primary {
  background: var(--celo);
  color: var(--bg);
  font-weight: 700;
  border-radius: 4px;
  padding: 0.5rem 1rem;
}

.btn-ghost {
  border: 1px solid var(--line);
  color: var(--text);
  border-radius: 4px;
  padding: 0.5rem 1rem;
}

.btn-stop {
  border: 1px solid var(--bad);
  color: var(--bad);
  font-weight: 700;
  letter-spacing: 0.1em;
  border-radius: 4px;
  padding: 0.5rem 1rem;
}

/* The ground drifts; the data snaps. Someone who has asked the OS to stop
   animating gets a still meter that is still correct. */
@media (prefers-reduced-motion: reduce) {
  .meter-turbulence animate { display: none; }
}
```

- [ ] **Step 7: Build the meter**

Create `app/components/Meter.tsx`:

```tsx
'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { formatAmount, percentUsed, refusalThreshold } from '../lib/policy.js'

type Props = {
  daily: bigint
  remaining: bigint
  perTx: bigint
  decimals: number
  symbol: string
  paused: boolean
}

/**
 * The one signature component. A current that grows more turbulent as the
 * agent approaches its cap and stops dead when it reaches it.
 *
 * It reads only remainingToday() and limits(), never the event log, so it
 * stays correct when log scanning fails. That is the whole reason this shape
 * was chosen over the impasto variant.
 */
export default function Meter({ daily, remaining, perTx, decimals, symbol, paused }: Props) {
  const id = useId().replace(/:/g, '')
  const used = percentUsed(daily, remaining)
  const atCap = daily > 0n && remaining === 0n
  const threshold = refusalThreshold(remaining, perTx)

  // Turbulence tracks how close the agent is to the wall: calm at the start,
  // violent near the cap, frozen at it.
  const scale = atCap ? 11 : 2 + (used / 100) * 8
  const period = atCap ? 0 : Math.max(3, 14 - (used / 100) * 11)

  // A filter animating in a hidden tab is pure cost. Stop it there.
  const [visible, setVisible] = useState(true)
  const ref = useRef<SVGAnimateElement>(null)
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  const animate = !atCap && visible && period > 0

  return (
    <div className="px-4 py-3" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div className="flex justify-between items-baseline">
        <span className="label">Remaining today</span>
        <span className="num text-sm" style={{ color: atCap ? 'var(--bad)' : 'var(--text)' }}>
          {formatAmount(remaining, decimals)} / {formatAmount(daily, decimals)} {symbol}
        </span>
      </div>

      <svg
        className="meter-turbulence block w-full mt-2"
        height={12}
        viewBox="0 0 600 14"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${used.toFixed(1)} percent of the daily allowance used`}
      >
        <defs>
          <filter id={`t${id}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.05 0.24"
              numOctaves={3}
              seed={7}
              result="n"
            >
              {animate && (
                <animate
                  ref={ref}
                  attributeName="seed"
                  values="7;60;7"
                  dur={`${period}s`}
                  repeatCount="indefinite"
                />
              )}
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="n"
              scale={scale}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
          <linearGradient id={`g${id}`}>
            <stop offset="0" stopColor="#1B4A63" />
            <stop offset="0.6" stopColor="#3E86A0" />
            <stop offset="1" stopColor="var(--celo)" />
          </linearGradient>
        </defs>

        <rect width="600" height="14" fill="var(--well)" />
        {!paused && (
          <rect
            width={Math.max(0, Math.min(597, (used / 100) * 597))}
            height="14"
            fill={`url(#g${id})`}
            filter={`url(#t${id})`}
          />
        )}
        <rect x={atCap ? 594 : 597} width={atCap ? 6 : 3} height="14" fill="var(--bad)" />
      </svg>

      <p className="label mt-2" style={{ color: atCap ? 'var(--bad)' : 'var(--dim)' }}>
        {paused
          ? 'Paused by the owner — every spend is refused'
          : threshold === 0n
            ? 'The allowance is spent — resets at UTC midnight'
            : `Next spend over ${formatAmount(threshold, decimals)} ${symbol} will be refused`}
      </p>
    </div>
  )
}
```

- [ ] **Step 8: Typecheck and commit**

```bash
cd app && pnpm run typecheck && pnpm vitest run
git add app
git commit -m "feat(app): design tokens and the allowance meter

The meter reads remainingToday() and limits() only, never the event log,
so the component the demo rests on cannot be broken by a failed log scan.

It states the refusal threshold before money moves rather than after: a
refused spend is a staticcall and never becomes a transaction, so there is
no history to show and the UI must not imply one."
```

---

## Task 4: Dashboard read path — `/a/<address>`

Spec §1.2, §2.3, §4. `T5.2` — the first filmable moment. It must work with no
wallet connected.

**Files:**
- Create: `app/lib/feed.ts`, `app/test/feed.test.ts`
- Create: `app/lib/useAccountState.ts`, `app/lib/useFeed.ts`
- Create: `app/components/Feed.tsx`
- Create: `app/app/a/[address]/page.tsx`

**Interfaces:**
- Consumes: `Meter`, `policy.ts`, `address.ts`, `publicClient` from Tasks 2–3;
  `spendPolicyAccountAbi` from `@leash/sdk`.
- Produces:
  - `app/lib/feed.ts` exports
    `type FeedRow = { kind: 'spent' | 'toppedUp' | 'policy' | 'paused' | 'unpaused'; text: string; amount: bigint | null; txHash: \`0x${string}\`; blockNumber: bigint }`
    and `describeLog(log): FeedRow`.
  - `app/lib/useAccountState.ts` exports
    `useAccountState(account: \`0x${string}\`, token: \`0x${string}\`)` returning
    `{ daily, remaining, perTx, paused, owner, isLoading, error, refetch }`.
  - `app/lib/useFeed.ts` exports `useFeed(account, fromBlock?)` returning
    `{ rows: FeedRow[], isLoading, error }`.

- [ ] **Step 1: Write the failing test for feed formatting**

Create `app/test/feed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { describeLog } from '../lib/feed.js'

const TX = ('0x' + 'ab'.repeat(32)) as `0x${string}`
const PAYEE = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'

describe('describeLog', () => {
  it('renders a spend with its payee', () => {
    const row = describeLog({
      eventName: 'Spent',
      args: { token: PAYEE, to: PAYEE, amount: 10_000n, operator: PAYEE },
      transactionHash: TX,
      blockNumber: 100n,
    })
    expect(row.kind).toBe('spent')
    expect(row.text).toBe('Spent to 0x2B33…4f57')
    expect(row.amount).toBe(10_000n)
  })

  it('renders a top-up as money leaving the policy, not a payment', () => {
    const row = describeLog({
      eventName: 'ToppedUp',
      args: { token: PAYEE, operator: PAYEE, amount: 9_300n },
      transactionHash: TX,
      blockNumber: 101n,
    })
    expect(row.kind).toBe('toppedUp')
    expect(row.text).toBe('Topped up the agent wallet')
    expect(row.amount).toBe(9_300n)
  })

  it('renders a policy change with no amount column', () => {
    const row = describeLog({
      eventName: 'PolicyChanged',
      args: { token: PAYEE, perTx: 500_000n, daily: 1_000_000n },
      transactionHash: TX,
      blockNumber: 102n,
    })
    expect(row.kind).toBe('policy')
    expect(row.amount).toBeNull()
  })

  it('distinguishes pausing from resuming', () => {
    expect(describeLog({
      eventName: 'PausedSet', args: { paused: true },
      transactionHash: TX, blockNumber: 103n,
    }).kind).toBe('paused')

    expect(describeLog({
      eventName: 'PausedSet', args: { paused: false },
      transactionHash: TX, blockNumber: 104n,
    }).kind).toBe('unpaused')
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
cd app && pnpm vitest run test/feed.test.ts
```

Expected: FAIL — `Failed to resolve import "../lib/feed.js"`.

- [ ] **Step 3: Implement feed formatting**

Create `app/lib/feed.ts`:

```ts
import { truncateAddress } from './address.js'

export type FeedRow = {
  kind: 'spent' | 'toppedUp' | 'policy' | 'paused' | 'unpaused'
  text: string
  amount: bigint | null
  txHash: `0x${string}`
  blockNumber: bigint
}

type DecodedLog = {
  eventName: string
  args: Record<string, unknown>
  transactionHash: `0x${string}`
  blockNumber: bigint
}

/**
 * Turns one decoded event into a display row.
 *
 * Only on-chain events appear here. A spend the policy refused never became a
 * transaction — the MCP server pre-checks with a staticcall — so the feed has
 * no blocked rows to show and must not pretend otherwise. The wall is stated
 * by the meter instead, before money moves.
 */
export function describeLog(log: DecodedLog): FeedRow {
  const base = { txHash: log.transactionHash, blockNumber: log.blockNumber }

  switch (log.eventName) {
    case 'Spent':
      return {
        ...base, kind: 'spent',
        text: `Spent to ${truncateAddress(String(log.args.to))}`,
        amount: log.args.amount as bigint,
      }
    case 'ToppedUp':
      return {
        ...base, kind: 'toppedUp',
        text: 'Topped up the agent wallet',
        amount: log.args.amount as bigint,
      }
    case 'PolicyChanged':
      return { ...base, kind: 'policy', text: 'Limits changed', amount: null }
    case 'PausedSet':
      return log.args.paused === true
        ? { ...base, kind: 'paused', text: 'Paused by the owner', amount: null }
        : { ...base, kind: 'unpaused', text: 'Resumed by the owner', amount: null }
    default:
      return { ...base, kind: 'policy', text: log.eventName, amount: null }
  }
}
```

- [ ] **Step 4: Run and verify it passes**

```bash
cd app && pnpm vitest run test/feed.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Write the account-state hook**

Create `app/lib/useAccountState.ts`:

```ts
'use client'

import { useCallback, useEffect, useState } from 'react'
import { spendPolicyAccountAbi } from '@leash/sdk'
import { publicClient } from './chain.js'

const OWNER_AND_PAUSED_ABI = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
] as const

export type AccountState = {
  daily: bigint
  remaining: bigint
  perTx: bigint
  paused: boolean
  owner: `0x${string}` | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * The authoritative read. Polls every 4 seconds against Celo's ~5s blocks.
 *
 * `limits().spentToday` is deliberately discarded: it is stale after a UTC day
 * rolls over until the next spend. Callers derive spend from daily and
 * remaining instead.
 */
export function useAccountState(
  account: `0x${string}`,
  token: `0x${string}`,
): AccountState {
  const [state, setState] = useState<Omit<AccountState, 'refetch'>>({
    daily: 0n, remaining: 0n, perTx: 0n, paused: false, owner: null,
    isLoading: true, error: null,
  })

  const read = useCallback(async () => {
    try {
      const [limits, remaining, paused, owner] = await Promise.all([
        publicClient.readContract({
          address: account, abi: spendPolicyAccountAbi,
          functionName: 'limits', args: [token],
        }),
        publicClient.readContract({
          address: account, abi: spendPolicyAccountAbi,
          functionName: 'remainingToday', args: [token],
        }),
        publicClient.readContract({
          address: account, abi: OWNER_AND_PAUSED_ABI, functionName: 'paused',
        }),
        publicClient.readContract({
          address: account, abi: OWNER_AND_PAUSED_ABI, functionName: 'owner',
        }),
      ])
      const [perTx, daily] = limits as readonly [bigint, bigint, bigint, bigint]
      setState({
        perTx, daily, remaining: remaining as bigint,
        paused: paused as boolean, owner: owner as `0x${string}`,
        isLoading: false, error: null,
      })
    } catch (e) {
      setState((s) => ({ ...s, isLoading: false, error: e as Error }))
    }
  }, [account, token])

  useEffect(() => {
    void read()
    const t = setInterval(() => { if (!document.hidden) void read() }, 4000)
    return () => clearInterval(t)
  }, [read])

  return { ...state, refetch: read }
}
```

- [ ] **Step 6: Write the feed hook**

Create `app/lib/useFeed.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import { publicClient } from './chain.js'
import { describeLog, type FeedRow } from './feed.js'

const EVENT_ABI = [
  { type: 'event', name: 'Spent', inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false },
    { name: 'operator', type: 'address', indexed: true }] },
  { type: 'event', name: 'ToppedUp', inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'operator', type: 'address', indexed: true },
    { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'PolicyChanged', inputs: [
    { name: 'token', type: 'address', indexed: true },
    { name: 'perTx', type: 'uint256', indexed: false },
    { name: 'daily', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'PausedSet', inputs: [
    { name: 'paused', type: 'bool', indexed: false }] },
] as const

// Celo blocks are ~5s, so three days is roughly this many. forno will not
// serve that range in one call, hence the chunking below.
const WINDOW_BLOCKS = 51_840n
const CHUNK = 5_000n

export function useFeed(account: `0x${string}`, fromBlock?: bigint) {
  const [rows, setRows] = useState<FeedRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    async function backfill() {
      try {
        const head = await publicClient.getBlockNumber()
        const start = fromBlock ?? (head > WINDOW_BLOCKS ? head - WINDOW_BLOCKS : 0n)
        const collected: FeedRow[] = []

        for (let from = start; from <= head; from += CHUNK) {
          const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n
          // One retry: forno is load-balanced and a single node may refuse a
          // range the next one serves.
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const logs = await publicClient.getLogs({
                address: account, events: EVENT_ABI, fromBlock: from, toBlock: to,
              })
              for (const l of logs) {
                collected.push(describeLog({
                  eventName: l.eventName as string,
                  args: l.args as Record<string, unknown>,
                  transactionHash: l.transactionHash,
                  blockNumber: l.blockNumber,
                }))
              }
              break
            } catch (e) {
              if (attempt === 1) throw e
            }
          }
        }

        if (!cancelled) {
          collected.sort((a, b) => Number(b.blockNumber - a.blockNumber))
          setRows(collected)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) { setError(e as Error); setLoading(false) }
      }
    }

    void backfill()

    // EVENT_ABI, not spendPolicyAccountAbi: the SDK's ABI carries functions
    // and error definitions only — it has no `event` entries, so watching
    // with it would silently never fire.
    const unwatch = publicClient.watchContractEvent({
      address: account, abi: EVENT_ABI, poll: true, pollingInterval: 4000,
      onLogs: (logs) => {
        setRows((prev) => [
          ...logs.map((l) => describeLog({
            eventName: (l as { eventName: string }).eventName,
            args: (l as { args: Record<string, unknown> }).args,
            transactionHash: l.transactionHash as `0x${string}`,
            blockNumber: l.blockNumber as bigint,
          })),
          ...prev,
        ])
      },
    })

    return () => { cancelled = true; unwatch() }
  }, [account, fromBlock])

  return { rows, isLoading, error }
}
```

- [ ] **Step 7: Build the feed component and the dashboard page**

Create `app/components/Feed.tsx`:

```tsx
'use client'

import { formatAmount } from '../lib/policy.js'
import type { FeedRow } from '../lib/feed.js'

export default function Feed({
  rows, decimals, symbol, isLoading, hasPolicy,
}: {
  rows: FeedRow[]; decimals: number; symbol: string
  isLoading: boolean; hasPolicy: boolean
}) {
  // A freshly deployed account has no policy, and every operator path reverts
  // TokenNotConfigured until the owner sets one. Saying so beats an empty list.
  if (!hasPolicy) {
    return (
      <div className="panel p-4">
        <p className="label">No limits set</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
          Until the owner sets a per-transaction and a daily cap, this account
          refuses every spend. Open <strong>Limits</strong> to set them.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return <div className="panel p-4"><p className="label">Loading activity…</p></div>
  }

  if (rows.length === 0) {
    return (
      <div className="panel p-4">
        <p className="label">No activity yet</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--dim)' }}>
          Nothing has been spent in the last three days.
        </p>
      </div>
    )
  }

  return (
    <div className="panel px-4">
      {rows.map((r) => (
        <div
          key={`${r.txHash}-${r.blockNumber}-${r.text}`}
          className="flex items-center gap-3 py-2 text-sm"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: r.kind === 'paused' ? 'var(--bad)' : 'var(--ok)' }}
          />
          <span className="flex-1">{r.text}</span>
          {r.amount !== null && (
            <span className="num" style={{ color: 'var(--amber)' }}>
              {formatAmount(r.amount, decimals)} {symbol}
            </span>
          )}
          <a
            className="label"
            href={`https://celoscan.io/tx/${r.txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            tx
          </a>
        </div>
      ))}
    </div>
  )
}
```

Create `app/app/a/[address]/page.tsx`. Note the split: the address guard has
to happen **outside** the component that calls hooks, because a conditional
`return` before a `useEffect` breaks the Rules of Hooks and React will throw.

```tsx
'use client'

import { use } from 'react'
import Meter from '../../../components/Meter'
import Feed from '../../../components/Feed'
import ConnectButton from '../../../components/ConnectButton'
import { useAccountState } from '../../../lib/useAccountState.js'
import { useFeed } from '../../../lib/useFeed.js'
import { isValidAddress, truncateAddress } from '../../../lib/address.js'

// USDC on Celo mainnet. The token the policy is denominated in; the UI treats
// stablecoins as 1:1 with the dollar, and that assumption lives here in the UI
// and never in the contract.
const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const DECIMALS = 6
const SYMBOL = 'USDC'

export default function DashboardRoute({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  if (!isValidAddress(address)) {
    return <main className="p-6"><p>That is not a Celo address.</p></main>
  }
  return <Dashboard address={address} />
}

function Dashboard({ address }: { address: `0x${string}` }) {
  const state = useAccountState(address, TOKEN)
  const feed = useFeed(address)

  return (
    <main>
      <header
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: state.paused ? 'var(--bad)' : 'var(--panel)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <strong style={{ color: state.paused ? 'var(--text)' : 'var(--celo)', letterSpacing: '.26em' }}>
          LEASH
        </strong>
        <a
          className="label"
          href={`https://celoscan.io/address/${address}`}
          target="_blank"
          rel="noreferrer"
        >
          {truncateAddress(address)}
        </a>
        <span className="ml-auto"><ConnectButton /></span>
      </header>

      <Meter
        daily={state.daily}
        remaining={state.remaining}
        perTx={state.perTx}
        decimals={DECIMALS}
        symbol={SYMBOL}
        paused={state.paused}
      />

      <div className="p-4">
        <Feed
          rows={feed.rows}
          decimals={DECIMALS}
          symbol={SYMBOL}
          isLoading={feed.isLoading}
          hasPolicy={state.daily > 0n}
        />
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Verify against the real account with no wallet**

```bash
cd app && pnpm run dev
```

Open `http://localhost:3000/a/<the address from Task 1>` in a **private window
with no wallet extension**. Confirm: the meter shows real numbers, the refusal
line names a real threshold, and the feed lists real transactions. This is the
judge's path — if it needs a wallet, the design intent is broken.

- [ ] **Step 9: Typecheck, test and commit**

```bash
cd app && pnpm run typecheck && pnpm vitest run && pnpm run build
git add app
git commit -m "feat(app): the dashboard read path, no wallet required

/a/<address> renders in full for a visitor with no wallet, which is both
the judge's path and what makes the smoke test possible.

Meter and feed read from separate sources on purpose: the meter is two
view calls and is authoritative, the feed is best-effort log scanning. The
component the demo rests on does not fail when a getLogs chunk does."
```

---

## Task 5: Limits drawer and the stop button

Spec §4. `T5.4` plus the `pause()` gap — a product whose claim is control had no
stop button.

**Files:**
- Create: `app/components/LimitsDrawer.tsx`, `app/components/StopButton.tsx`
- Modify: `app/app/a/[address]/page.tsx`

**Interfaces:**
- Consumes: `useAccountState` (for `owner`, `paused`, `perTx`, `daily`,
  `refetch`), `parseAmount` and `formatAmount` from `policy.ts`.
- Produces: `<LimitsDrawer account token decimals symbol perTx daily isOwner
  onSaved />` and `<StopButton account paused isOwner onChanged />`.

- [ ] **Step 1: Write the failing test for the owner gate**

Add to `app/test/policy.test.ts`:

```ts
import { canEdit } from '../lib/policy.js'

describe('canEdit', () => {
  it('lets the owner write', () => {
    expect(canEdit('0xAbC0000000000000000000000000000000000001',
                   '0xabc0000000000000000000000000000000000001')).toBe(true)
  })

  it('compares case-insensitively, since one side is checksummed', () => {
    expect(canEdit('0xABC0000000000000000000000000000000000001',
                   '0xabc0000000000000000000000000000000000001')).toBe(true)
  })

  it('refuses a different wallet', () => {
    expect(canEdit('0xAbC0000000000000000000000000000000000001',
                   '0xdEf0000000000000000000000000000000000002')).toBe(false)
  })

  it('refuses when no wallet is connected', () => {
    expect(canEdit('0xAbC0000000000000000000000000000000000001', undefined)).toBe(false)
  })

  it('refuses when the owner has not loaded yet', () => {
    expect(canEdit(null, '0xabc0000000000000000000000000000000000001')).toBe(false)
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
cd app && pnpm vitest run test/policy.test.ts
```

Expected: FAIL — `canEdit` is not exported.

- [ ] **Step 3: Implement `canEdit`**

Append to `app/lib/policy.ts`:

```ts
/**
 * Whether the connected wallet may write to this account.
 *
 * This is a display gate, not a security boundary — the contract's onlyOwner
 * modifier is the security boundary. It exists so a non-owner is not offered
 * a button whose transaction would certainly revert.
 */
export function canEdit(
  owner: string | null | undefined,
  connected: string | null | undefined,
): boolean {
  if (!owner || !connected) return false
  return owner.toLowerCase() === connected.toLowerCase()
}
```

- [ ] **Step 4: Run and verify it passes**

```bash
cd app && pnpm vitest run test/policy.test.ts
```

Expected: 22 passed.

- [ ] **Step 5: Build the stop button**

Create `app/components/StopButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { publicClient } from '../lib/chain.js'

const PAUSE_ABI = [
  { type: 'function', name: 'setPaused', stateMutability: 'nonpayable',
    inputs: [{ name: 'paused', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'paused', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }] },
] as const

/**
 * The kill switch. Two beats rather than a modal: a modal breaks the pace of
 * a live demo, and this is a real transaction either way.
 */
export default function StopButton({
  account, paused, isOwner, onChanged,
}: {
  account: `0x${string}`; paused: boolean; isOwner: boolean; onChanged: () => void
}) {
  const [arming, setArming] = useState(false)
  const [busy, setBusy] = useState(false)
  const { writeContractAsync } = useWriteContract()

  if (!isOwner) {
    return <span className="label">{paused ? 'Paused' : 'Active'}</span>
  }

  async function send(next: boolean) {
    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: PAUSE_ABI, functionName: 'setPaused', args: [next],
      })
      // Wait on the condition, not the receipt: forno serves stale reads
      // after a confirmed transaction.
      for (let i = 0; i < 20; i++) {
        const now = await publicClient.readContract({
          address: account, abi: PAUSE_ABI, functionName: 'paused',
        })
        if (now === next) break
        await new Promise((r) => setTimeout(r, 3000))
      }
      onChanged()
    } finally {
      setBusy(false)
      setArming(false)
    }
  }

  if (paused) {
    return (
      <button className="btn-ghost" disabled={busy} onClick={() => void send(false)}>
        {busy ? 'Resuming…' : 'Resume'}
      </button>
    )
  }

  return (
    <button
      className="btn-stop"
      disabled={busy}
      onClick={() => (arming ? void send(true) : setArming(true))}
      onBlur={() => setArming(false)}
    >
      {busy ? 'Stopping…' : arming ? 'Confirm stop' : '■ Stop'}
    </button>
  )
}
```

- [ ] **Step 6: Build the limits drawer**

Create `app/components/LimitsDrawer.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { publicClient } from '../lib/chain.js'
import { formatAmount, parseAmount } from '../lib/policy.js'

const SET_POLICY_ABI = [
  { type: 'function', name: 'setPolicy', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'perTx', type: 'uint256' },
      { name: 'daily', type: 'uint256' }],
    outputs: [] },
  { type: 'function', name: 'limits', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'perTx', type: 'uint256' }, { name: 'daily', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' }, { name: 'day', type: 'uint64' }] },
] as const

export default function LimitsDrawer({
  account, token, decimals, symbol, perTx, daily, isOwner, onSaved,
}: {
  account: `0x${string}`; token: `0x${string}`; decimals: number; symbol: string
  perTx: bigint; daily: bigint; isOwner: boolean; onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [perTxInput, setPerTx] = useState(formatAmount(perTx, decimals, 2))
  const [dailyInput, setDaily] = useState(formatAmount(daily, decimals, 2))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { writeContractAsync } = useWriteContract()

  async function save() {
    setError(null)
    let nextPerTx: bigint
    let nextDaily: bigint
    try {
      nextPerTx = parseAmount(perTxInput, decimals)
      nextDaily = parseAmount(dailyInput, decimals)
    } catch (e) {
      setError((e as Error).message)
      return
    }
    if (nextPerTx > nextDaily) {
      setError('The per-transaction cap cannot exceed the daily cap.')
      return
    }
    setBusy(true)
    try {
      await writeContractAsync({
        address: account, abi: SET_POLICY_ABI, functionName: 'setPolicy',
        args: [token, nextPerTx, nextDaily],
      })
      for (let i = 0; i < 20; i++) {
        const l = await publicClient.readContract({
          address: account, abi: SET_POLICY_ABI, functionName: 'limits', args: [token],
        }) as readonly [bigint, bigint, bigint, bigint]
        if (l[0] === nextPerTx && l[1] === nextDaily) break
        await new Promise((r) => setTimeout(r, 3000))
      }
      onSaved()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(!open)}>Limits</button>
      {open && (
        <div className="panel p-4 mt-3">
          <p className="label">Per transaction ({symbol})</p>
          <input
            className="num w-full mt-1 mb-3 p-2"
            style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
            value={perTxInput}
            onChange={(e) => setPerTx(e.target.value)}
            disabled={!isOwner || busy}
          />
          <p className="label">Per day ({symbol})</p>
          <input
            className="num w-full mt-1 mb-3 p-2"
            style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
            value={dailyInput}
            onChange={(e) => setDaily(e.target.value)}
            disabled={!isOwner || busy}
          />
          {error && <p className="text-sm mb-2" style={{ color: 'var(--bad)' }}>{error}</p>}
          {isOwner ? (
            <button className="btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <p className="label">Only the owner can change these limits.</p>
          )}
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 7: Wire both into the dashboard**

In `app/app/a/[address]/page.tsx`, add the imports and the owner gate:

```tsx
import { useAccount } from 'wagmi'
import LimitsDrawer from '../../../components/LimitsDrawer'
import StopButton from '../../../components/StopButton'
import { canEdit } from '../../../lib/policy.js'
```

Inside the inner `Dashboard` component (**not** `DashboardRoute` — hooks must
stay behind the address guard), after `const feed = useFeed(address)`:

```tsx
  const { address: connected } = useAccount()
  const isOwner = canEdit(state.owner, connected)
```

Put `<StopButton account={address} paused={state.paused} isOwner={isOwner}
onChanged={state.refetch} />` in the header before `<ConnectButton />`, and
`<LimitsDrawer account={address} token={TOKEN} decimals={DECIMALS}
symbol={SYMBOL} perTx={state.perTx} daily={state.daily} isOwner={isOwner}
onSaved={state.refetch} />` above `<Feed …/>` in the body.

- [ ] **Step 8: Verify against the live account**

With the owner wallet connected, open `/a/<address>`, press **Stop**, confirm
the button becomes **Confirm stop**, press again, and watch the header turn
vermilion and the meter go flat. Press **Resume** and watch it return. Then set
the per-transaction cap above the daily cap and confirm it is refused before any
transaction is sent.

- [ ] **Step 9: Typecheck, test and commit**

```bash
cd app && pnpm run typecheck && pnpm vitest run && pnpm run build
git add app
git commit -m "feat(app): limits editor and the stop button

The contract has had a kill switch since Plan 1 and the frontend design
named no way to reach it. For a product whose whole claim is control, that
was the hole.

Two beats instead of a modal, because a modal breaks the pace of a live
demo. Both writes poll the value they changed rather than trusting the
receipt."
```

---

## Task 6: Onboard and the `.mcp.json` handoff

Spec §5, §5.1. `T5.3`. This is the distribution funnel: it ends with a stranger's
agent able to spend.

**Files:**
- Create: `app/lib/mcpJson.ts`, `app/test/mcpJson.test.ts`
- Create: `app/components/McpHandoff.tsx`
- Modify: `app/app/page.tsx`

**Interfaces:**
- Consumes: `isValidAddress`, `parseAmount`, `wagmiConfig`, `publicClient`,
  `KNOWN_FEE_ADAPTERS` and `FEE_CURRENCY_DIRECTORY` from `@leash/sdk`.
- Produces:
  - `app/lib/mcpJson.ts` exports
    `type McpHandoff = { account: \`0x${string}\`; token: \`0x${string}\`; feeAdapter: \`0x${string}\`; attributionTag: string }`
    and `buildMcpJson(h: McpHandoff): string`, and the constant
    `OPERATOR_PK_PLACEHOLDER = '0xYourAgentOperatorPrivateKey'`.

- [ ] **Step 1: Write the failing test for the handoff block**

Create `app/test/mcpJson.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildMcpJson, OPERATOR_PK_PLACEHOLDER } from '../lib/mcpJson.js'

const handoff = {
  account: '0x895B773Ef88cA27699Df58F9F45962F847bbE9CE',
  token: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  feeAdapter: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
  attributionTag: 'celo_3dec652cd977',
} as const

describe('buildMcpJson', () => {
  it('produces valid JSON', () => {
    expect(() => JSON.parse(buildMcpJson(handoff))).not.toThrow()
  })

  it('fills in every value the app knows', () => {
    const env = JSON.parse(buildMcpJson(handoff)).mcpServers.leash.env
    expect(env.LEASH_ACCOUNT).toBe(handoff.account)
    expect(env.SPEND_TOKEN).toBe(handoff.token)
    expect(env.FEE_ADAPTER).toBe(handoff.feeAdapter)
    expect(env.ATTRIBUTION_TAG).toBe(handoff.attributionTag)
  })

  // The single most important assertion in this file. The app must never
  // hold, request, or emit a private key.
  it('leaves the operator key as a placeholder and never a real key', () => {
    const out = buildMcpJson(handoff)
    const env = JSON.parse(out).mcpServers.leash.env
    expect(env.OPERATOR_PK).toBe(OPERATOR_PK_PLACEHOLDER)
    expect(out).not.toMatch(/0x[0-9a-fA-F]{64}/)
  })

  it('names the server "leash" so the documented tool names resolve', () => {
    expect(Object.keys(JSON.parse(buildMcpJson(handoff)).mcpServers)).toEqual(['leash'])
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
cd app && pnpm vitest run test/mcpJson.test.ts
```

Expected: FAIL — `Failed to resolve import "../lib/mcpJson.js"`.

- [ ] **Step 3: Implement the generator**

Create `app/lib/mcpJson.ts`:

```ts
export type McpHandoff = {
  account: `0x${string}`
  token: `0x${string}`
  feeAdapter: `0x${string}`
  attributionTag: string
}

/**
 * The one value this app must never learn. The operator key is pasted by the
 * user, locally, into the file this block becomes.
 */
export const OPERATOR_PK_PLACEHOLDER = '0xYourAgentOperatorPrivateKey'

/** Mirrors the block documented in docs/mcp-setup.md. */
export function buildMcpJson(h: McpHandoff): string {
  return JSON.stringify(
    {
      mcpServers: {
        leash: {
          command: 'npx',
          args: ['-y', 'tsx', '/absolute/path/to/leash/mcp/src/index.ts'],
          env: {
            LEASH_ACCOUNT: h.account,
            OPERATOR_PK: OPERATOR_PK_PLACEHOLDER,
            ATTRIBUTION_TAG: h.attributionTag,
            SPEND_TOKEN: h.token,
            FEE_ADAPTER: h.feeAdapter,
          },
        },
      },
    },
    null,
    2,
  )
}
```

- [ ] **Step 4: Run and verify it passes**

```bash
cd app && pnpm vitest run test/mcpJson.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Build the handoff component**

Create `app/components/McpHandoff.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { buildMcpJson, type McpHandoff as Handoff } from '../lib/mcpJson.js'

export default function McpHandoff({ handoff }: { handoff: Handoff }) {
  const [copied, setCopied] = useState(false)
  const block = buildMcpJson(handoff)

  return (
    <div className="panel p-4">
      <p className="label">Add this to your agent&apos;s .mcp.json</p>
      <pre
        className="num text-xs mt-2 p-3 overflow-x-auto"
        style={{ background: 'var(--well)', borderRadius: 4 }}
      >
        {block}
      </pre>
      <button
        className="btn-primary mt-3"
        onClick={() => {
          void navigator.clipboard.writeText(block)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <p className="text-sm mt-3" style={{ color: 'var(--bad)' }}>
        Replace <code>OPERATOR_PK</code> with your agent wallet&apos;s private key
        yourself. This site never asks for it and never sees it. It is a hot key:
        whoever holds it can spend up to your limits.
      </p>
      <p className="text-sm mt-2" style={{ color: 'var(--dim)' }}>
        Point <code>args</code> at your own checkout of the Leash repository.
      </p>
    </div>
  )
}
```

- [ ] **Step 6: Build the wizard**

Replace `app/app/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useAccount, useDeployContract, useWriteContract } from 'wagmi'
import { KNOWN_FEE_ADAPTERS, FEE_CURRENCY_DIRECTORY } from '@leash/sdk'
import ConnectButton from '../components/ConnectButton'
import McpHandoff from '../components/McpHandoff'
import { publicClient } from '../lib/chain.js'
import { isValidAddress } from '../lib/address.js'
import { parseAmount } from '../lib/policy.js'

const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const USDC_FEE_ADAPTER = '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' as const
const DECIMALS = 6

const DIRECTORY_ABI = [
  { type: 'function', name: 'getCurrencies', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address[]' }] },
] as const

const SETUP_ABI = [
  { type: 'function', name: 'setOperator', stateMutability: 'nonpayable',
    inputs: [{ name: 'operator', type: 'address' }, { name: 'enabled', type: 'bool' }],
    outputs: [] },
  { type: 'function', name: 'setPolicy', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' },
             { name: 'perTx', type: 'uint256' },
             { name: 'daily', type: 'uint256' }],
    outputs: [] },
] as const

export default function Onboard() {
  const { address: connected, isConnected } = useAccount()
  const [account, setAccount] = useState<`0x${string}` | null>(null)
  const [agent, setAgent] = useState('')
  const [perTx, setPerTx] = useState('0.50')
  const [daily, setDaily] = useState('5.00')
  const [tag, setTag] = useState('')
  const [feeAdapter, setFeeAdapter] = useState<`0x${string}` | null>(null)
  const [funded, setFunded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { deployContractAsync } = useDeployContract()
  const { writeContractAsync } = useWriteContract()

  // Offer the previously deployed account rather than making the user
  // remember an address they were shown once.
  useEffect(() => {
    const saved = localStorage.getItem('leash.account')
    if (saved && isValidAddress(saved)) setAccount(saved)
  }, [])

  // Never trust a fee adapter from memory: assert this one is on the
  // directory's live whitelist before putting it in someone's config.
  useEffect(() => {
    void (async () => {
      const live = await publicClient.readContract({
        address: FEE_CURRENCY_DIRECTORY, abi: DIRECTORY_ABI,
        functionName: 'getCurrencies',
      }) as readonly `0x${string}`[]
      const ok =
        live.some((a) => a.toLowerCase() === USDC_FEE_ADAPTER.toLowerCase()) &&
        (KNOWN_FEE_ADAPTERS as readonly string[])
          .some((a) => a.toLowerCase() === USDC_FEE_ADAPTER.toLowerCase())
      if (ok) setFeeAdapter(USDC_FEE_ADAPTER)
      else setError('The USDC fee adapter is not on the on-chain whitelist. Stop and re-run spikes/fee-currency.ts.')
    })()
  }, [])

  async function deploy() {
    setError(null)
    // SpendPolicyAccount's ABI and bytecode are emitted by `forge build` into
    // contracts/out. Task 6 Step 7 copies them into app/lib/contract.ts.
    const { abi, bytecode } = await import('../lib/contract.js')
    const hash = await deployContractAsync({ abi, bytecode, args: [connected!] })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (!receipt.contractAddress) { setError('Deployment produced no address.'); return }
    setAccount(receipt.contractAddress)
    localStorage.setItem('leash.account', receipt.contractAddress)
    localStorage.setItem('leash.deployBlock', receipt.blockNumber.toString())
  }

  async function addAgent() {
    setError(null)
    if (!isValidAddress(agent)) { setError('That is not a Celo address.'); return }
    await writeContractAsync({
      address: account!, abi: SETUP_ABI, functionName: 'setOperator', args: [agent, true],
    })
  }

  async function setLimits() {
    setError(null)
    try {
      await writeContractAsync({
        address: account!, abi: SETUP_ABI, functionName: 'setPolicy',
        args: [TOKEN, parseAmount(perTx, DECIMALS), parseAmount(daily, DECIMALS)],
      })
    } catch (e) { setError((e as Error).message) }
  }

  // Wait on the balance, not on a receipt someone else's wallet produced.
  async function waitForFunding() {
    for (let i = 0; i < 60; i++) {
      const bal = await publicClient.readContract({
        address: TOKEN,
        abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view',
                inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
        functionName: 'balanceOf', args: [account!],
      }) as bigint
      if (bal > 0n) { setFunded(true); return }
      await new Promise((r) => setTimeout(r, 5000))
    }
    setError('No balance seen after five minutes. Check the transfer and try again.')
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 style={{ color: 'var(--celo)', letterSpacing: '.26em' }}>LEASH</h1>
      <p style={{ color: 'var(--dim)' }}>
        Give an AI agent a wallet without trusting it. Spend limits are enforced
        on Celo, not by a prompt.
      </p>

      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      <section className="panel p-4">
        <p className="label">Step 1 — Connect</p>
        <div className="mt-2"><ConnectButton /></div>
      </section>

      {isConnected && (
        <section className="panel p-4">
          <p className="label">Step 2 — Deploy your account</p>
          <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>
            You own it. Costs about $0.013 in gas.
          </p>
          {account
            ? <p className="num mt-2">{account}</p>
            : <button className="btn-primary mt-2" onClick={() => void deploy()}>Deploy</button>}
        </section>
      )}

      {account && (
        <>
          <section className="panel p-4">
            <p className="label">Step 3 — Add your agent</p>
            <p className="text-sm mt-1" style={{ color: 'var(--bad)' }}>
              This must be the wallet you registered as your agentWalletAddress.
              A different address silently voids your x402 attribution — nothing
              errors, the leaderboard simply reads zero.
            </p>
            <input
              className="num w-full mt-2 p-2"
              style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
              placeholder="0x…" value={agent} onChange={(e) => setAgent(e.target.value)}
            />
            <button className="btn-primary mt-2" onClick={() => void addAgent()}>Add agent</button>
          </section>

          <section className="panel p-4">
            <p className="label">Step 4 — Set limits (USDC)</p>
            <input className="num w-full mt-2 p-2"
              style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
              value={perTx} onChange={(e) => setPerTx(e.target.value)} />
            <input className="num w-full mt-2 p-2"
              style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
              value={daily} onChange={(e) => setDaily(e.target.value)} />
            <button className="btn-primary mt-2" onClick={() => void setLimits()}>Save limits</button>
          </section>

          <section className="panel p-4">
            <p className="label">Step 5 — Fund it</p>
            <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>
              Send USDC to <span className="num">{account}</span>. Send USDC, not
              CELO — this contract refuses native value on purpose.
            </p>
            <button className="btn-ghost mt-2" onClick={() => void waitForFunding()}>
              {funded ? 'Funded' : 'Check balance'}
            </button>
          </section>

          {feeAdapter && (
            <section>
              <p className="label mb-2">Step 6 — Connect your agent</p>
              <input
                className="num w-full mb-3 p-2"
                style={{ background: 'var(--well)', border: '1px solid var(--line)', borderRadius: 4 }}
                placeholder="celo_ your attribution tag"
                value={tag} onChange={(e) => setTag(e.target.value)}
              />
              <McpHandoff handoff={{ account, token: TOKEN, feeAdapter, attributionTag: tag || 'celo_yourtag' }} />
              <a className="label block mt-3" href={`/a/${account}`}>Open your dashboard →</a>
            </section>
          )}
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Export the contract artifact for the deploy step**

```bash
cd contracts && forge build
cd .. && node -e "
const a=require('./contracts/out/SpendPolicyAccount.sol/SpendPolicyAccount.json');
const fs=require('fs');
fs.writeFileSync('app/lib/contract.ts',
  '// Generated from contracts/out by \`forge build\`. Regenerate after any\n' +
  '// contract change — a stale bytecode here deploys the old contract.\n' +
  'export const abi = ' + JSON.stringify(a.abi) + ' as const\n' +
  'export const bytecode = ' + JSON.stringify(a.bytecode.object) + ' as \`0x\${string}\`\n');
console.log('wrote app/lib/contract.ts');
"
```

Confirm the file begins with the generated comment and that `bytecode` starts
with `0x`.

- [ ] **Step 8: Verify the full flow on mainnet with a throwaway wallet**

Deploy an account from a wallet that is **not** the project owner, add an agent,
set limits, fund it with 0.05 USDC, and copy the emitted block. Confirm the
copied JSON has `OPERATOR_PK` as the placeholder and contains no 64-hex string.

- [ ] **Step 9: Typecheck, test and commit**

```bash
cd app && pnpm run typecheck && pnpm vitest run && pnpm run build
git add app
git commit -m "feat(app): onboarding, ending in a filled-in .mcp.json

The app knew a user's account address and gave them no way to connect it.
This is the step that turns a viewer into a user.

The app fills in four values and refuses to touch the fifth: OPERATOR_PK
stays a placeholder, asserted by a test that also fails if any 64-hex
string reaches the output. The fee adapter is checked against the
directory's live getCurrencies() before it goes into anyone's config."
```

---

## Task 7: Operator gas float and the owner's refuel — P1

Spec §1.7. **This is the cut line.** If time runs short, skip Task 7 and go
straight to Task 8; nothing else depends on it.

**Files:**
- Create: `app/lib/gasFloat.ts`, `app/test/gasFloat.test.ts`
- Create: `app/components/AgentPanel.tsx`
- Modify: `app/app/a/[address]/page.tsx`

**Interfaces:**
- Consumes: `formatAmount`, `parseAmount`, `canEdit`, `publicClient`.
- Produces: `transactionsLeft(float: bigint): number` and
  `<AgentPanel account operator token decimals symbol isOwner onRefuelled />`.

- [ ] **Step 1: Write the failing test**

Create `app/test/gasFloat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { transactionsLeft } from '../lib/gasFloat.js'

describe('transactionsLeft', () => {
  // Measured 2026-09-02: ~0.0028 USDC spent per transaction, ~0.0046
  // reserved before the node will simulate one at all.
  it('matches the measured float of the live operator', () => {
    expect(transactionsLeft(12_215n)).toBe(3)
  })

  it('is zero below the reserve, since nothing can be sent at all', () => {
    expect(transactionsLeft(4_000n)).toBe(0)
  })

  it('is one when the float covers the reserve but no more', () => {
    expect(transactionsLeft(4_600n)).toBe(1)
  })

  it('is zero for an empty wallet', () => {
    expect(transactionsLeft(0n)).toBe(0)
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
cd app && pnpm vitest run test/gasFloat.test.ts
```

Expected: FAIL — `Failed to resolve import "../lib/gasFloat.js"`.

- [ ] **Step 3: Implement it**

Create `app/lib/gasFloat.ts`:

```ts
/**
 * Measured on Celo mainnet 2026-09-02, in USDC atomic units (6 decimals).
 *
 * The reserve is not the price. A node holds RESERVE against the balance
 * before it will simulate a fee-currency transaction, so a wallet holding
 * less than that cannot transact at all even though a transaction costs less.
 */
const COST_PER_TX = 2_800n
const RESERVE = 4_600n

/**
 * How many more transactions the agent can send before it stalls.
 *
 * This is the number that matters: when it reaches zero the agent stops, and
 * it cannot draw more from the account because drawing costs gas.
 */
export function transactionsLeft(float: bigint): number {
  if (float < RESERVE) return 0
  return Number((float - RESERVE) / COST_PER_TX) + 1
}
```

- [ ] **Step 4: Run and verify it passes**

```bash
cd app && pnpm vitest run test/gasFloat.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Build the agent panel**

Create `app/components/AgentPanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useWriteContract } from 'wagmi'
import { publicClient } from '../lib/chain.js'
import { formatAmount, parseAmount } from '../lib/policy.js'
import { transactionsLeft } from '../lib/gasFloat.js'
import { truncateAddress } from '../lib/address.js'

const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

const SWEEP_ABI = [
  { type: 'function', name: 'sweep', stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' },
             { name: 'to', type: 'address' },
             { name: 'amount', type: 'uint256' }],
    outputs: [] },
] as const

/**
 * Refuelling goes through sweep(), not topUpOperator().
 *
 * topUpOperator is the agent's own path and costs the agent gas — which is
 * exactly what it has run out of. sweep is the owner's, and the owner is
 * deliberately unconstrained by policy, so the rescue works when nothing else
 * does.
 */
export default function AgentPanel({
  account, operator, token, decimals, symbol, isOwner, onRefuelled,
}: {
  account: `0x${string}`; operator: `0x${string}`; token: `0x${string}`
  decimals: number; symbol: string; isOwner: boolean; onRefuelled: () => void
}) {
  const [float, setFloat] = useState<bigint | null>(null)
  const [busy, setBusy] = useState(false)
  const { writeContractAsync } = useWriteContract()

  useEffect(() => {
    async function read() {
      const bal = await publicClient.readContract({
        address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [operator],
      }) as bigint
      setFloat(bal)
    }
    void read()
    const t = setInterval(() => { if (!document.hidden) void read() }, 8000)
    return () => clearInterval(t)
  }, [operator, token])

  if (float === null) return null
  const left = transactionsLeft(float)
  const low = left <= 3

  async function refuel() {
    setBusy(true)
    try {
      const amount = parseAmount('0.05', decimals)
      await writeContractAsync({
        address: account, abi: SWEEP_ABI, functionName: 'sweep',
        args: [token, operator, amount],
      })
      for (let i = 0; i < 20; i++) {
        const bal = await publicClient.readContract({
          address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [operator],
        }) as bigint
        if (bal > float!) { setFloat(bal); break }
        await new Promise((r) => setTimeout(r, 3000))
      }
      onRefuelled()
    } finally { setBusy(false) }
  }

  return (
    <div className="panel p-4">
      <p className="label">Agent wallet</p>
      <p className="num text-sm mt-1">{truncateAddress(operator)}</p>
      <p className="text-sm mt-2" style={{ color: low ? 'var(--bad)' : 'var(--dim)' }}>
        {formatAmount(float, decimals)} {symbol} — about {left}{' '}
        {left === 1 ? 'transaction' : 'transactions'} of gas left
        {left === 0 && '. The agent has stalled and cannot refuel itself.'}
      </p>
      {isOwner && low && (
        <button className="btn-primary mt-3" disabled={busy} onClick={() => void refuel()}>
          {busy ? 'Sending…' : `Send 0.05 ${symbol} for gas`}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire it into the dashboard**

`AgentPanel` needs the operator address, which the dashboard does not know:
the contract stores operators in a `mapping(address => bool)`, which cannot be
enumerated. Read it from the most recent `Spent` or `ToppedUp` row — both carry
`operator` — falling back to a `?operator=0x…` query parameter when the feed is
empty.

Read the query parameter inside a `useEffect`, never during render: this page is
server-rendered before it hydrates, and touching `window.location` in the render
body produces a hydration mismatch. In the inner `Dashboard` component of
`app/app/a/[address]/page.tsx`:

```tsx
  const [operator, setOperator] = useState<string | null>(null)
  useEffect(() => {
    const fromFeed = feed.rows.find((r) => r.kind === 'spent' || r.kind === 'toppedUp')
    setOperator(
      fromFeed?.operator
        ?? new URLSearchParams(window.location.search).get('operator'),
    )
  }, [feed.rows])
```

`FeedRow` does not carry `operator` yet, so add it in `app/lib/feed.ts` — an
optional field set from `log.args.operator` for the `Spent` and `ToppedUp`
cases, `undefined` otherwise — and extend `app/test/feed.test.ts` with one case
asserting a `Spent` row exposes it. Then render, above `<Feed …/>`:

```tsx
  {operator && isValidAddress(operator) && (
    <AgentPanel
      account={address} operator={operator} token={TOKEN}
      decimals={DECIMALS} symbol={SYMBOL} isOwner={isOwner}
      onRefuelled={state.refetch}
    />
  )}
```

- [ ] **Step 7: Typecheck, test and commit**

```bash
cd app && pnpm run typecheck && pnpm vitest run && pnpm run build
git add app
git commit -m "feat(app): show the agent's gas float, and let the owner refuel it

When the operator's stablecoin runs out the agent stops, and it cannot
draw more because drawing costs gas. The rescue goes through sweep()
rather than topUpOperator(): the owner is deliberately unconstrained by
policy, so it works at exactly the moment the agent's own path cannot."
```

---

## Task 8: `examples/` — the agent that spends and then gets blocked

Spec §9. `T6.1`. This is both the demo script and what another team copies.

**Files:**
- Create: `examples/package.json`, `examples/tsconfig.json`,
  `examples/demo-agent.ts`, `examples/README.md`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: `LeashClient` and `describePreCheckFailure` from `@leash/sdk`,
  which already sets `GAS_LIMIT = 300_000n` on every transaction it sends.
- Produces: a runnable script, gated behind `LEASH_DEMO_SPEND_REAL_MONEY=yes`.

- [ ] **Step 1: Add `examples` to the workspace**

In `pnpm-workspace.yaml`:

```yaml
packages:
  - "sdk"
  - "mcp"
  - "app"
  - "examples"
  - "spikes"
```

- [ ] **Step 2: Create the package files**

Create `examples/package.json`:

```json
{
  "name": "@leash/examples",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "demo": "tsx demo-agent.ts", "typecheck": "tsc --noEmit" },
  "dependencies": { "@leash/sdk": "workspace:*", "viem": "^2.21.0" },
  "devDependencies": {
    "@types/node": "^22.0.0", "tsx": "^4.19.0", "typescript": "^5.6.0"
  }
}
```

Create `examples/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true, "noEmit": true, "skipLibCheck": true, "types": ["node"]
  },
  "include": ["*.ts"]
}
```

- [ ] **Step 3: Write the demo agent**

Create `examples/demo-agent.ts`:

```ts
/**
 * The demo, and the thing another team copies.
 *
 * Three spends land, and the fourth is refused by the contract's policy —
 * not by this script, and not by a prompt. Deliberately no LLM in the loop:
 * a demo that needs a model to cooperate is a demo that cannot be reshot.
 *
 * It moves real money on Celo mainnet. Run it with:
 *   LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm -F @leash/examples demo
 */
import { privateKeyToAccount } from 'viem/accounts'
import { LeashClient } from '@leash/sdk'

if (process.env.LEASH_DEMO_SPEND_REAL_MONEY !== 'yes') {
  console.error(
    'This script spends real USDC on Celo mainnet.\n' +
    'Re-run with LEASH_DEMO_SPEND_REAL_MONEY=yes if that is what you want.',
  )
  process.exit(1)
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

const account = privateKeyToAccount(required('OPERATOR_PK') as `0x${string}`)
const leash = new LeashClient({
  account,
  accountAddress: required('LEASH_ACCOUNT') as `0x${string}`,
  attributionTag: required('ATTRIBUTION_TAG'),
  rpcUrl: process.env.CELO_RPC_URL,
})

const token = required('SPEND_TOKEN') as `0x${string}`
const payee = required('SPEND_PAYEE') as `0x${string}`
const feeAdapter = required('FEE_ADAPTER') as `0x${string}`
const accountAddress = required('LEASH_ACCOUNT') as `0x${string}`

/**
 * The operator's real balance of the fee adapter.
 *
 * LeashClient has no feeBalances() of its own — callers build this map, the
 * same way mcp/src/index.ts does. It is read rather than assumed because
 * pickFeeAdapter throws when every adapter is empty, which is the honest
 * failure when the agent cannot pay for gas.
 */
async function feeBalances(): Promise<ReadonlyMap<`0x${string}`, bigint>> {
  return new Map([[feeAdapter, await leash.operatorBalance(feeAdapter)]])
}

const SMALL = 10_000n      // 0.01 USDC — comfortably inside both caps
const OVERSIZED = 900_000n // 0.90 USDC — above the 0.50 per-transaction cap

console.log('--- Leash demo ---')
console.log(`account  ${accountAddress}`)
console.log(`agent    ${account.address}`)

for (let i = 1; i <= 3; i++) {
  const check = await leash.preCheck(token, payee, SMALL)
  if (!check.ok) {
    console.log(`spend ${i}: refused before it started (${check.error})`)
    break
  }
  const hash = await leash.spend(token, payee, SMALL, await feeBalances())
  console.log(`spend ${i}: 0.01 USDC  https://celoscan.io/tx/${hash}`)
  console.log(`           remaining today: ${await leash.remainingToday(token)}`)
}

console.log('\nNow asking for more than the policy allows:')
const refused = await leash.preCheck(token, payee, OVERSIZED)
if (refused.ok) {
  console.error('The policy did NOT refuse an oversized spend. Check the caps.')
  process.exit(1)
}
console.log(JSON.stringify(refused, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
console.log(
  '\nThe contract refused it. Not the prompt, not this script — the contract.\n' +
  'Note that no transaction was sent: the refusal is a staticcall and costs no gas.',
)
```

- [ ] **Step 4: Typecheck against the real SDK surface**

```bash
pnpm install && pnpm -F @leash/examples typecheck
```

Expected: exit 0. The script above was written against the actual
`sdk/src/policyClient.ts`, which exposes `preCheck`, `spend`, `remainingToday`,
`operatorBalance`, `accountBalance`, `limits`, `preCheckTopUp` and `topUp` — and
deliberately has **no** `feeBalances()` and **no** public `accountAddress`
getter (`#address` is a private field). That is why the script builds the
fee-balance map itself and reads the account address from the environment.

**If a signature still differs, fix `demo-agent.ts` to match the SDK — never add
a method to the SDK for the demo's convenience.**

- [ ] **Step 5: Write the README**

Create `examples/README.md` documenting: what the script proves, the environment
variables it needs, the `LEASH_DEMO_SPEND_REAL_MONEY=yes` gate, the roughly 0.03
USDC plus gas it costs, and the same sequence expressed as `leash_status` /
`leash_pay` MCP tool calls for a reader who wants it inside their agent rather
than as a script.

- [ ] **Step 6: Run it against mainnet**

```bash
cd /Users/vanhuy/Desktop/celo && set -a && . ./.env && set +a
LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm -F @leash/examples demo
```

Expected: three transaction hashes, a falling `remaining today` after each, then
a structured refusal naming `per_tx_cap_exceeded`. Watch the dashboard at
`/a/<address>` while it runs — the feed and the meter should move.

- [ ] **Step 7: Commit**

```bash
git add examples pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(examples): an agent that spends, then gets blocked

No LLM in the loop on purpose: a demo that needs a model to cooperate
cannot be reshot. The refusal it prints is a staticcall, so the last beat
of the demo costs nothing and sends no transaction — which is the point
worth saying out loud."
```

---

## Task 9: Deploy and the smoke test

Spec §7. `T5.1` completion plus `T9`.

**Files:**
- Create: `app/playwright.config.ts`, `app/e2e/dashboard.spec.ts`
- Modify: `app/package.json` (add the `test:e2e` script and Playwright)
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above; the deployed account address from Task 1.
- Produces: a public URL, and one test that proves the judge's path works.

- [ ] **Step 1: Add Playwright**

```bash
cd app && pnpm add -D @playwright/test@^1.49.0 && pnpm exec playwright install chromium
```

Add to `app/package.json` scripts: `"test:e2e": "playwright test"`.

- [ ] **Step 2: Configure it**

Create `app/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // The dashboard reads mainnet over forno, which is not fast.
  timeout: 60_000,
  use: { baseURL: process.env.LEASH_E2E_URL ?? 'http://localhost:3000' },
  webServer: process.env.LEASH_E2E_URL
    ? undefined
    : { command: 'pnpm run build && pnpm run start', url: 'http://localhost:3000', timeout: 120_000 },
})
```

- [ ] **Step 3: Write the smoke test**

Create `app/e2e/dashboard.spec.ts`, replacing `ACCOUNT` with the address from
Task 1:

```ts
import { test, expect } from '@playwright/test'

const ACCOUNT = process.env.LEASH_E2E_ACCOUNT ?? '0xYourNewAccountFromTask1'

/**
 * The judge's path: open the submitted link in a browser with no wallet and
 * see a live account. If this breaks, the demo link is dead for anyone who
 * does not already hold a Celo wallet.
 */
test('the dashboard renders live numbers with no wallet connected', async ({ page }) => {
  await page.goto(`/a/${ACCOUNT}`)

  await expect(page.getByText('Remaining today')).toBeVisible()

  // A real amount, not a spinner and not NaN.
  const amount = page.locator('.num').first()
  await expect(amount).toContainText(/\d+\.\d{6}\s*\/\s*\d+\.\d{6}\s+USDC/, { timeout: 30_000 })

  // The wall is stated before money moves.
  await expect(
    page.getByText(/will be refused|allowance is spent|Paused by the owner/),
  ).toBeVisible()

  // And nothing asked for a wallet.
  await expect(page.getByText('Connect wallet')).toBeVisible()
})
```

- [ ] **Step 4: Run it locally**

```bash
cd app && LEASH_E2E_ACCOUNT=<address from Task 1> pnpm run test:e2e
```

Expected: 1 passed. If the amount assertion times out, the read path is broken
against mainnet — fix that before deploying, not after.

- [ ] **Step 5: Deploy to Vercel**

```bash
cd app && pnpm dlx vercel@latest deploy --prod
```

Set `NEXT_PUBLIC_CELO_RPC_URL` in the Vercel project if you use an RPC other
than forno. There are **no secrets to configure** — the app holds none.

- [ ] **Step 6: Run the smoke test against production**

```bash
cd app && LEASH_E2E_URL=https://<your-deployment> \
  LEASH_E2E_ACCOUNT=<address from Task 1> pnpm run test:e2e
```

Expected: 1 passed against the real deployment.

- [ ] **Step 7: Run everything, and paste the output**

```bash
cd /Users/vanhuy/Desktop/celo
(cd contracts && forge test)
(cd sdk && pnpm run test)
(cd mcp && pnpm run test)
(cd app && pnpm vitest run)
(cd sdk && pnpm exec tsc --noEmit)
(cd mcp && pnpm exec tsc --noEmit)
(cd spikes && pnpm exec tsc --noEmit)
(cd app && pnpm run typecheck && pnpm run build)
(cd examples && pnpm exec tsc --noEmit)
```

Expected: contracts 32, sdk 42, mcp 12, app 40, every `tsc` exit 0, `next build`
succeeding. (app 41 = address 6 + policy 22 + feed 5 + mcpJson 4 + gasFloat 4;
feed gains its fifth test in Task 7. If Task 7 was cut, app is 36.) **Paste the real output. Do not claim a suite passed without it.**

- [ ] **Step 8: Update the README and commit**

Add the live URL to `README.md` under a short "Try it" heading, pointing at
`/a/<account>` and noting that no wallet is needed to look. Then:

```bash
git add app README.md pnpm-lock.yaml
git commit -m "feat(app): ship it, with one test that guards the judge's path

The smoke test opens the dashboard with no wallet and asserts real numbers
render. That is the only path a stranger takes, and it is testable at all
only because the dashboard was built to read without a wallet."
```

---

## Self-Review

**Spec coverage.** §1.1 direct deploy → Task 6 Step 6. §1.2 URL route and
wallet-free reads → Task 4, guarded by Task 9. §1.3 no blocked history, and the
predictive band → Task 3 (`refusalThreshold`, meter copy) and Task 4
(`describeLog` comment). §1.4 palette → Task 3 Steps 1 and 6. §1.5 slim meter →
Task 3 Step 7. §1.6 English copy → Global Constraints. §1.7 float and refuel →
Task 7. §2.1 stack and no RainbowKit → Task 2. §2.3 two sources and the
`spentToday` trap → Tasks 3 and 4. §2.4 wait on the condition → Tasks 1, 5, 6.
§3 tokens → Task 3 Step 6. §4 dashboard, stop, empty state → Tasks 4 and 5.
§5 and §5.1 onboarding and handoff → Task 6. §6 contract and migration → Task 1.
§7 testing → every task, gathered in Task 9 Step 7. §9 examples → Task 8.

**Known gap, called out rather than left silent.** Task 7 Step 6 gets the
operator address from a query parameter or the feed, because the contract has no
`operators()` enumeration — only a `mapping(address => bool)`, which cannot be
listed. That is a real limitation of the deployed contract, not an oversight in
this plan; enumerating operators would need a contract change and Task 1 is
deliberately one line.

**Type consistency checked.** `formatAmount` / `parseAmount` / `spentToday` /
`percentUsed` / `refusalThreshold` / `canEdit` all live in `app/lib/policy.ts`
and are used with those exact names in Tasks 3–7. `FeedRow` and `describeLog`
match between `app/lib/feed.ts`, `useFeed.ts` and `Feed.tsx`. `McpHandoff` and
`buildMcpJson` match between `mcpJson.ts`, its test, and `McpHandoff.tsx`.
`transactionsLeft` matches between `gasFloat.ts` and `AgentPanel.tsx`.

**Two bugs found and fixed during this review.** The first draft of Task 8
called `leash.feeBalances()` and read `leash.accountAddress`. Neither exists:
`LeashClient` takes the fee-balance map as an argument — callers build it, as
`mcp/src/index.ts:31` does — and keeps its account address in a private
`#address` field. Both were corrected against the real source rather than left
for the implementer to trip over. The rest of the SDK surface used here
(`preCheck`, `spend`, `remainingToday`, `operatorBalance`) was read from
`sdk/src/policyClient.ts` and matches.
