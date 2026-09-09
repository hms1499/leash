# Leash app — flow audit fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close the defects two independent passes over `app/` found on
2026-09-09 — a manual full-flow read and a `/code-review app/ --effort high`
agent — in the order that a wrong statement about someone's money costs the
most.

**Source:** this plan carries its own defect statements instead of citing a
separate `specs/` document. Each task opens with what is wrong, what a user sees
when it bites, and the evidence. That is the spec, and it is inline so a task
cannot be executed without reading why it exists. Every claim below was
re-verified against the source before it was written down; where the review
agent's reasoning was wrong, the task says so.

**Architecture:** no new dependency, no new route, no contract change. Most
fixes move a decision out of a component into `app/lib/` where the
node-environment suite can reach it — the pattern `lib/meter.ts` already set and
states its reason for.

**The thread running through Tasks 1–6:** every one is the app asserting
something it never established. A ready badge over a payment the allowlist
refuses; a lowered cap the owner never typed; a created account that reverted; a
quiet feed over blocks nobody read; a verified operator over a `localStorage`
that threw; zero accounts over an RPC that never answered. `CLAUDE.md` states
the rule they break — *"Never report a write as confirmed unless it was
observed"* — and `lib/meter.ts:46` records what it cost the last time.

**Baseline, measured 2026-09-09 before any change here:**

| Suite | Result |
|---|---|
| `pnpm -F @leash/app test` | 207/207 |
| `pnpm -F @leash/app test:e2e` | 13/13 |
| `npx tsc --noEmit` in `app` | exit 0 |

Those are the numbers to beat, and the numbers `CLAUDE.md` and `docs/RESUME.md`
currently get wrong (Task 14).

## Global constraints

- **`app/vitest.config.ts` runs in the node environment and no component-testing
  dependency may be added** (spec §2.2). A decision that must be tested has to
  live in `app/lib/` as data, the way `meterState` and `spendBand` already do.
  This constraint shapes most of this plan. Where a fix genuinely cannot be
  tested — it is an assignment order inside a hook, or two lines inside a
  component — the task says so **and says how it was verified instead**. Do not
  quietly skip it.
- **The state vocabulary of `docs/design-system.md` §5 is not to be reworded.**
  Those are the four `band.kind` sentences in `Meter.tsx`. Task 1 adds a clause
  to the *fifth* branch (`ceiling`), which is not part of that vocabulary.
- **The type scale is six steps** (`lib/type.ts`): display 44 / title 30 /
  heading 18 / body 14 / data 13 / label 11. A seventh means one of these is
  doing two jobs.
- **The bright/dark ground rule** (`docs/design-system.md` §4): dark grounds take
  any foreground but `--bg`; bright grounds (`--bad`, `--celo`) take only `--bg`.
- Every write passes an explicit `chainId: REQUIRED_CHAIN_ID` and every caller
  checks `chainId !== REQUIRED_CHAIN_ID` first. 14 write sites, 14 explicit chain
  ids today. Do not add the fifteenth without both.
- Confirm by polling the value that changed, never by a receipt. 13 `pollUntil`
  sites today.
- No ESLint/Prettier/Biome config exists. Match the style of surrounding code.
- Comments explain *why*, especially where a line guards a hazard that was paid
  for. Do not strip such comments when editing nearby code.
- Commit subjects describe the defect in plain English, not the diff.
- Never claim a step passed without running it and reading the output.

---

# Phase A — the app must not assert what it never established

Tasks 1–8. **Stopping after Task 8 is a complete, coherent result.**

---

## Task 1: Stop saying "ready to spend" about payments the allowlist refuses

### The defect

The gate **into** recipient protection is guarded and the gate **out** is not.

`components/LimitsDrawer.tsx:281` refuses to turn protection on until an address
is verified approved, and says why: *"An empty allowlist blocks every direct
payment."* But `setPayeeAccess(false)` (`LimitsDrawer.tsx:255`) removes an
approved address while `allowlistEnabled` stays `true`, with no warning. Remove
the only approved payee and every `execute()` reverts `PayeeNotAllowed`.

Nothing then says so:

- `components/DashboardOverview.tsx:16` — `accountSummary` never reads
  `allowlistEnabled`, though `useAccountState` returns it and
  `app/a/[address]/page.tsx:290` already passes it to `SecurityPolicy`. The badge
  prints **"Ready · Agent is ready to spend"**.
- `lib/meter.ts` `spendBand` is blind the same way: it prints "Maximum next
  direct payment — 0.50 USDC · limited by the per-transaction cap" for a payment
  that cannot land.

Same bug class as `lib/meter.ts:46` — a full allowance drawn on an empty
account. This is a full allowance drawn on an empty allowlist.

**What limits the fix:** `payeeAllowlist` is a `mapping(address => bool)` and is
not enumerable, so the app **cannot** know whether the address being removed was
the last. The fix is not a prediction: warn honestly at the moment of removal,
and never state "ready to spend" without naming the restriction.

**What is not affected:** `topUpOperator` deliberately bypasses the allowlist
(`SpendPolicyAccount.sol`), so x402 and gas draws keep working. The failure is
confined to direct payments and `leash_pay`. Quieter, not smaller.

**Files:**
- Create: `app/lib/accountHealth.ts`, `app/test/accountHealth.test.ts`
- Modify: `app/components/DashboardOverview.tsx`, `app/lib/meter.ts`,
  `app/test/meter.test.ts`, `app/components/Meter.tsx`,
  `app/components/landing/LiveProof.tsx:45`, `app/app/a/[address]/page.tsx:271`,
  `app/components/LimitsDrawer.tsx`

- [ ] **Step 1: Move the health decision somewhere it can be tested**

Create `app/lib/accountHealth.ts`. Move `accountSummary` from
`DashboardOverview.tsx:16` verbatim, rename it `accountHealth`, export it and
its return type, with this comment:

```ts
/**
 * The dashboard's one-line verdict on an account, as data.
 *
 * Extracted from DashboardOverview.tsx so it can be tested at all:
 * app/vitest.config.ts runs in the node environment and no component-testing
 * dependency may be added (spec §2.2). Here for the same reason meterState
 * and spendBand are.
 */
```

No logic changes in this step. `pnpm test` and `npx tsc --noEmit` must both pass
before Step 2.

- [ ] **Step 2: Teach it that recipient protection is a condition on "ready"**

Add `allowlistEnabled: boolean` to the input. Replace the final `Ready` return:

```ts
  // Recipient protection is a real precondition on the direct-payment path,
  // and the one condition this function cannot verify. payeeAllowlist is a
  // mapping(address => bool) and is not enumerable, so the app cannot ask the
  // contract whether ANY payee is approved -- an account with protection on
  // and an empty allowlist reads exactly like a healthy one and refuses every
  // execute() with PayeeNotAllowed.
  //
  // So this does not claim the allowlist is populated. It names the
  // restriction and stops short, which is the only true thing available.
  if (allowlistEnabled) {
    return {
      badge: 'Ready',
      title: 'Agent is ready to spend',
      body: 'Policy, protected funds, operator access and agent gas are all available. Recipient protection is on, so direct payments reach approved addresses only — every other payee is refused.',
      tone: 'ok',
      action: isOwner ? { href: '#policy-controls', label: 'Review recipients' } : undefined,
    }
  }
```

Thread `allowlistEnabled` through `AccountOverview`'s props from
`app/a/[address]/page.tsx` (`state.allowlistEnabled` is already in scope).

- [ ] **Step 3: Test it**

Create `app/test/accountHealth.test.ts`. Cover: every earlier branch still wins
over the allowlist clause — `loading`, `paused`, `daily === 0n`,
`operatorLoading`, `!operator`, `balance === 0n`, `agentTransactionsLeft` null
and `0` — each asserted with `allowlistEnabled: true` so the new branch cannot
swallow one; `false` returns the unqualified body; `true` names approved
addresses and stays `tone: 'ok'`; a non-owner gets no `action`.

- [ ] **Step 4: Qualify the meter's ceiling figure**

In `lib/meter.ts` add `allowlistEnabled: boolean` to `spendBand`'s input and
`restrictedToApprovedPayees: boolean` to the `ceiling` variant, set from the
input on both `ceiling` returns. Leave `loading`, `paused`, `unfunded`,
`exhausted` untouched — design-system §5 vocabulary.

In `Meter.tsx`, extend only the clause under the figure:

```tsx
          <p className="mt-2" style={{ ...PROSE, color: 'var(--dim)' }}>
            limited by the {band.limitedBy}
            {band.restrictedToApprovedPayees && ' · approved recipients only'}
          </p>
```

Pass `allowlistEnabled` from both callers (`a/[address]/page.tsx:271`,
`landing/LiveProof.tsx:45`). Both already hold a `useAccountState` result;
neither needs a new read. Extend `test/meter.test.ts`.

- [ ] **Step 5: Arm the removal that can brick the payment path**

Give `setPayeeAccess(false)` the two-beat confirmation `StopButton` and
`AgentAccessPanel` already use — a `removeArming` state, reset on the existing
`onBlur`/input-change handlers, second press sends. Between the beats:

```tsx
{removeArming && (
  <p role="alert" className="text-sm mt-2" style={{ color: 'var(--bad)' }}>
    Recipient protection is on. If this is the last approved address, every
    direct payment will be refused until another is approved — and the
    contract cannot be asked how many remain.
  </p>
)}
```

Only arm when `allowlistEnabled` is true. With protection off, removal changes
nothing and must not grow a warning it does not deserve.

- [ ] **Step 6: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git add app/lib/accountHealth.ts app/test/accountHealth.test.ts app/lib/meter.ts \
        app/test/meter.test.ts app/components/DashboardOverview.tsx \
        app/components/Meter.tsx app/components/LimitsDrawer.tsx \
        app/components/landing/LiveProof.tsx "app/app/a/[address]/page.tsx"
git commit -m "fix(app): an account whose allowlist refuses every payee reported itself ready to spend"
```

---

## Task 2: A pre-filled limits form must not lower a cap the owner never touched

### The defect

`formatAmount` truncates — `lib/policy.ts:33` is
`fraction.padEnd(places, '0').slice(0, places)`, no rounding — and its truncated
output is pre-filled into both limit editors as if it were the owner's intent.

Verified against the real function:

| On-chain `perTx` | `formatAmount(v, 6, 2)` | What happens |
|---|---|---|
| `505000` (0.505) | `"0.50"` | `validateLimits`' no-op guard does not fire (`500000n !== 505000n`), so pressing **Save limits** without touching the form **writes a lower cap** |
| `5000` (0.005) | `"0.00"` | The drawer shows the cap as zero, and `validateLimits` refuses every save with *"A per-transaction cap of 0 would refuse every spend"* — the editor is unusable for that account |

Both editors are affected: `LimitsDrawer.tsx:63` and `setup/page.tsx:205`.

**And it empties the wizard.** `setup/page.tsx:238` computes the stage from
`limitsConfirmed: Boolean(nextLimits)` — limits exist on chain — while the
component's `readiness.limitsConfirmed` (`page.tsx:120`) re-derives it by
comparing `parseAmount(perTx)` against `confirmedLimits`, using the *truncated*
string. For 0.505 the two disagree, `setActiveStage(4)` runs, and then
`activeStage === 1|2|3` are all false while stage 4's guard
(`page.tsx:794`) also requires `readiness.ready`. **No block matches: the wizard
renders its header and progress nav and nothing else**, with steps 3 and 4
disabled by `stageUnlocked`. There is no way forward.

An account configured through the SDK, MCP or `cast` at sub-cent precision hits
all three. The wizard writes 2-decimal values, which is why this has not been
seen.

**Files:**
- Modify: `app/lib/policy.ts` (comment only), `app/test/policy.test.ts`,
  `app/components/LimitsDrawer.tsx:63`, `app/app/setup/page.tsx:205`, `:794`

- [ ] **Step 1: Pre-fill with a string that round-trips**

`formatDisplayAmount(value, decimals, 2)` never truncates — it pads to
`decimals` and strips only trailing zeros above `minimumPlaces`. Verified:
`505000 → "0.505"`, `500000 → "0.50"`, `5000 → "0.005"`, `1 → "0.000001"`. All
parse back to the exact input.

Replace both pre-fills:

```ts
// LimitsDrawer.tsx:63 and setup/page.tsx:205
setPerTx(formatDisplayAmount(perTx, decimals, 2))
setDaily(formatDisplayAmount(daily, decimals, 2))
```

Add to `formatAmount`'s doc comment in `lib/policy.ts`, so the next caller does
not repeat this:

```ts
 * `places` TRUNCATES. Never use it to pre-fill an editable field: the
 * truncated string becomes the value that gets written back, so a cap of
 * 0.505 pre-fills as 0.50 and an untouched Save lowers it. Use
 * formatDisplayAmount for anything a user can submit.
```

- [ ] **Step 2: Assert the round-trip, so this cannot come back**

In `app/test/policy.test.ts`:

```ts
it('every pre-fillable amount survives a round trip through the form', () => {
  // A cap set through the SDK or cast can carry six decimals. The form
  // pre-fill must not be the thing that changes it.
  for (const v of [1n, 5000n, 500000n, 505000n, 999999n, 1_000_000n, 12_345_678n]) {
    expect(parseAmount(formatDisplayAmount(v, 6, 2), 6)).toBe(v)
  }
})
```

Add the counter-example too, naming what it documents: `formatAmount(505000n, 6, 2)`
is `'0.50'` and is therefore not usable for a pre-fill.

- [ ] **Step 3: Make an unmatched stage impossible to render as nothing**

Step 1 removes the cause, but the wizard should not be able to render a blank
body for *any* future disagreement. At `page.tsx:794`, after the four stage
blocks, add a fallback that fires when no block matched:

```tsx
      {/* Every stage guard is a conjunction, so a disagreement between
          firstSetupStage's inputs (line 238) and the readiness this render
          derives leaves no block matching and the body blank -- with steps 3
          and 4 disabled, which is a dead end. A truncating pre-fill caused
          exactly that for a sub-cent cap. The cause is fixed; this makes the
          shape non-fatal. */}
      {activeStage === 4 && !(readiness.ready && confirmedLimits) && (
        <Panel as="section" className="p-6 mt-6">
          <p className="text-sm" style={{ color: 'var(--bad)' }}>
            This account&apos;s setup could not be summarised. Go back a step to
            check its limits, agent and balances.
          </p>
          <Button variant="ghost" className="mt-3" onClick={() => setActiveStage(3)}>
            Back to step 3
          </Button>
        </Panel>
      )}
```

- [ ] **Step 4: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git add app/lib/policy.ts app/test/policy.test.ts app/components/LimitsDrawer.tsx app/app/setup/page.tsx
git commit -m "fix(app): a pre-filled limits form truncated a sub-cent cap and then wrote the truncation back"
```

---

## Task 3: A reverted deployment must not be saved as an account

### The defect

`app/app/setup/page.tsx:273` holds the only `waitForTransactionReceipt` in the
app, and checks `receipt.contractAddress` without checking `receipt.status`.

go-ethereum sets `ContractAddress` on the receipt for **any** transaction with
`to == nil`, regardless of execution result. A deployment that reverts or
exhausts the fixed `DEPLOY_GAS` (1,200,000, `lib/chain.ts:70`) returns a non-null
address, so the wizard runs `setAccount()`, `savePolicyAccount()`,
`selectPolicyAccount()` and `announceAccountRegistryChange()` against an address
holding no code, renders "✓ Protected account created" and advances to step 2.

The `[account]` effect then fails its reads and the user is told:

> Could not verify this account on Celo. Check your connection and try again.

A failed deployment reported as a network problem, plus a junk entry left in
`/accounts`.

`CLAUDE.md` states the rule verbatim: *"`waitForTransactionReceipt` resolves on
revert, so check `receipt.status`."* `examples/demo-agent.ts:171` obeys it. The
SDK already exports `confirmTransaction`, which returns `'reverted'` for exactly
this. The wizard is the one place that does neither — and it is the path a
stranger walks first.

**Files:**
- Create: `app/lib/deploy.ts`, `app/test/deploy.test.ts`
- Modify: `app/app/setup/page.tsx:257-290`

- [ ] **Step 1: Put the receipt decision where it can be tested**

Create `app/lib/deploy.ts`:

```ts
export type DeployOutcome =
  | { ok: true; address: `0x${string}` }
  | { ok: false; message: string }

/**
 * What a deployment receipt actually means.
 *
 * `contractAddress` is not evidence of success. go-ethereum fills it in for
 * every transaction with `to == nil`, whatever the execution did, so a
 * reverted or out-of-gas creation comes back with an address that holds no
 * code. Saving it registers a junk account and then reports the failure as a
 * network problem on the next read.
 *
 * CLAUDE.md: a receipt is not confirmation, and `waitForTransactionReceipt`
 * resolves on revert. Here rather than inline because app/vitest.config.ts
 * runs in the node environment and a decision inside a component cannot be
 * tested (spec §2.2).
 */
export function describeDeployReceipt(
  receipt: { status: 'success' | 'reverted'; contractAddress?: `0x${string}` | null },
  hash: `0x${string}`,
): DeployOutcome {
  if (receipt.status !== 'success') {
    return {
      ok: false,
      message: `The deployment reverted on chain (${hash}). No account was created and nothing was saved. Check the transaction before trying again.`,
    }
  }
  if (!receipt.contractAddress) {
    return {
      ok: false,
      message: `Sent as ${hash}, but no contract address was returned. Check the transaction before trying again.`,
    }
  }
  return { ok: true, address: receipt.contractAddress }
}
```

- [ ] **Step 2: Use it, and save nothing on the failing branches**

```ts
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        const outcome = describeDeployReceipt(receipt, hash)
        if (!outcome.ok) { setError(outcome.message); return }
        setAccount(outcome.address)
        savePolicyAccount(localStorage, connected!, {
          address: outcome.address, deployBlock: receipt.blockNumber.toString(),
        })
        selectPolicyAccount(localStorage, connected!, outcome.address)
```

The early `return` is the point: on either failure nothing reaches localStorage,
so `/accounts` stays clean and the restore effect is never asked to explain a
contract that does not exist.

- [ ] **Step 3: Test it** — `reverted` with an address fails and says "reverted";
  `success` with a null address fails and says the address was not returned;
  `success` with an address returns it.

- [ ] **Step 4: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit
git add app/lib/deploy.ts app/test/deploy.test.ts app/app/setup/page.tsx
git commit -m "fix(app): a reverted deployment was saved as an account and then blamed on the network"
```

---

## Task 4: The feed must not report a quiet account over blocks it never read

### The defect

`lib/useFeed.ts` never initialises the tail cursor when the tab starts hidden.

`tail()` returns at `if (cancelled || document.hidden) return` **before** the
`if (lastSeen === null) { lastSeen = head; return }` that sets it. So:

- **Tab opened in the background** (cmd-click, session restore). Backfill scans
  `[head−86400, head_mount]`. Every tail tick bails at the hidden check, so
  `lastSeen` stays `null` for the whole hidden period. An hour later the tab is
  focused: the first tick sets `lastSeen = head_now` and returns. Blocks
  `head_mount+1 … head_now` — an hour of `Spent` / `ToppedUp` / `PausedSet` — are
  queried by **nothing**, and `Feed.tsx` renders *"Nothing has been spent in the
  last 24 hours"*: a claim about a range it never read.
- **Visible tab, in miniature.** The ~4 blocks between the backfill's
  `getBlockNumber` and the first tail tick are always skipped. Celo produces one
  block per second, so that is a real four-second hole on every load — on the
  panel a live demo is pointed at.

The comment above the hidden check says *"The cursor stays put, and tailRange
clamps the catch-up when it comes back."* The clamp is real (`tailRange` caps at
`MAX_LOG_RANGE_BLOCKS`); the cursor was never set.

**Files:**
- Modify: `app/lib/useFeed.ts`

- [ ] **Step 1: Set the cursor where the range is actually known**

Move `let lastSeen: bigint | null = null` **above** `void backfill()` — today it
is declared after, and only the `await` inside `backfill` keeps that from being a
TDZ error. Then, in `backfill()`, immediately after its `getBlockNumber`:

```ts
        const head = await publicClient.getBlockNumber()
        if (!cancelled) setHead({ block: head, seenAt: Date.now() })
        // The tail's cursor starts where the backfill's scan ends, not where
        // the first tail tick happens to land. Set in the tail instead, it was
        // never set at all on a tab that started hidden -- every tick bailed on
        // document.hidden first -- so the whole hidden period went unqueried
        // and the feed then called that a quiet account. On a visible tab it
        // still lost the ~4 blocks (4 seconds, on Celo) between this call and
        // the first tick.
        lastSeen = head
```

Keep the `if (lastSeen === null) { lastSeen = head; return }` branch in `tail()`
as the fallback for a backfill that threw before reaching that line — but add a
comment saying that is now its only job.

- [ ] **Step 2: Verify by hand, because this one has no unit test**

`useFeed` is a hook and the suite is node-only (spec §2.2), so the assignment
order cannot be asserted mechanically. Verify it the way the defect was found:

1. `pnpm -F @leash/app dev`, then **cmd-click** the dashboard link so the tab
   opens in the background. Leave it there two minutes.
2. Focus the tab. The rows for that window must be present, not "Nothing has
   been spent in the last 24 hours".
3. Record in the commit body that this was checked by hand and how.

An `expect.poll` e2e case is possible but would need a real spend inside the
window to be meaningful, which costs mainnet money. Do not fake it with a
stubbed RPC — that tests the stub.

- [ ] **Step 3: Commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git add app/lib/useFeed.ts
git commit -m "fix(app): a feed opened in a background tab reported a quiet account over blocks it never scanned"
```

---

## Task 5: Blocked browser storage must not strand a panel forever

### The defect

The operator-resolution effect at `app/a/[address]/page.tsx:129` calls
`localStorage.getItem` **outside** its own `try` block, and the effect is invoked
as bare `void resolve()`.

In Safari private mode, or any third-party context where storage access throws
`SecurityError`, `resolve()` rejects before its try block. `setOperator`,
`setOperatorCheckFailed` and `setOperatorResolving(false)` all never run.
`operatorResolving` stays `true`, so `operatorLoading` stays `true`, so
`AgentAccessPanel` shows *"Checking operator access on chain…"* and
`AccountOverview` shows *"Verifying agent access"* **permanently**, with no error
path and no retry — the 8-second retry only fires when `operatorCheckFailed` is
set, which is exactly what did not happen.

The sibling `deployBlock` effect twenty lines above (`page.tsx:74`) wraps its
`localStorage` read in `try/catch` with a comment naming this hazard: *"A browser
with storage blocked simply scans the whole window."* This effect dropped the
guard.

Two more unguarded reads share the shape: `app/setup/page.tsx:155`
(`migrateLegacyAccount(localStorage, connected)` and the two `getItem` calls
below it) would throw inside their effect and leave the wizard stuck at stage 1
with `account` null and nothing said, and `components/AccountSwitcher.tsx:25`
would throw inside its refresh.

**Files:**
- Modify: `app/app/a/[address]/page.tsx`, `app/app/setup/page.tsx`,
  `app/components/AccountSwitcher.tsx`

- [ ] **Step 1: Guard the read, and make the invocation fail closed**

In `resolve()`, both fixes — the specific one and the one that survives the next
edit:

```ts
      // Storage can throw, not merely return null: Safari private mode and
      // blocked third-party contexts raise SecurityError on access. Outside a
      // guard this rejected resolve() before its try block, so nothing ever
      // cleared operatorResolving and the panel said "Checking…" forever. The
      // deployBlock effect above already learned this.
      let fromSetup: string | null = null
      try { fromSetup = localStorage.getItem(`leash.agent.${address.toLowerCase()}`) }
      catch { /* the other candidates still decide; operators() still verifies */ }
```

and replace `void resolve()` with:

```ts
    // Fail closed on anything this function did not anticipate. A rejected
    // resolve() used to leave every one of its three setState calls unmade,
    // which reads as "still checking" and never resolves.
    void resolve().catch(() => {
      if (cancelled) return
      setOperator(null)
      setOperatorCheckFailed(true)
      setOperatorResolving(false)
    })
```

`setOperatorCheckFailed(true)` matters: it is what starts the existing 8-second
retry, so a transient failure heals.

- [ ] **Step 2: Guard the other two**

`app/setup/page.tsx:155` — wrap the effect body's storage access in `try/catch`;
on a throw, fall through to `setAccount(null); setActiveStage(1)`, which is the
correct behaviour for a browser that cannot remember anything.

`components/AccountSwitcher.tsx:25` — wrap `refresh`'s
`migrateLegacyAccount(localStorage, connected)` and render an empty switcher on
a throw. A switcher that cannot list accounts is not an error worth a banner.

- [ ] **Step 3: Verify**

No unit test — all three are inside components. Verify in a browser:
`pnpm -F @leash/app dev`, open DevTools, and block storage
(Application → Storage, or Safari private browsing). `/a/<address>` must resolve
the agent panel or show its error, never sit on "Checking…"; `/setup` must land
on step 1; the switcher must render empty. Record what was checked in the commit
body.

- [ ] **Step 4: Commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git add "app/app/a/[address]/page.tsx" app/app/setup/page.tsx app/components/AccountSwitcher.tsx
git commit -m "fix(app): a browser with storage blocked left the agent panel checking forever"
```

---

## Task 6: An RPC that did not answer is not "no accounts found"

### The defect

`components/AccountsPage.tsx:41` `verifyPolicyAccount` catches **every** error as
`'incompatible'`. Discovery then reports the count of verified accounts as if
the unverified ones had been checked and rejected.

An owner with three protected accounts opens `/accounts`. Discovery returns 40
candidates and fires six `eth_call`s each — 240 requests, 30 concurrent per batch
of 5 — at forno, which rate-limits or 500s. Every `Promise.all` rejects, every
candidate becomes `'incompatible'`, `discovered` is 0, and the page states:

> 0 compatible protected accounts found in Celo history.

and, on a first visit, *"No compatible protected accounts were found. Create one
to get started."* — absence the app never established. It is the exact pattern
`Feed.tsx` and `useAccountState` already refuse in comments.

**Files:**
- Modify: `app/lib/accountDiscovery.ts`, `app/test/accountDiscovery.test.ts`,
  `app/components/AccountsPage.tsx`

- [ ] **Step 1: Separate "not a Leash account" from "the chain did not answer"**

Add a fourth outcome to `verifyPolicyAccount`: `'unreadable'`. viem raises
`ContractFunctionExecutionError` for a revert or a call to an address with no
code, and transport errors (`HttpRequestError`, `TimeoutError`,
`RpcRequestError`) for a node that did not answer. Classify on that:

```ts
  } catch (error) {
    // A contract that answered "no" and a node that did not answer are
    // different facts. Collapsing them is how "we could not check" became
    // "you have no accounts" -- an assertion of absence from a failed read,
    // which this app refuses everywhere else (Feed.tsx, useAccountState.ts).
    const name = (error as { name?: string }).name ?? ''
    return name.includes('ContractFunctionExecutionError') ? 'incompatible' : 'unreadable'
  }
```

Verify the actual class name against the installed viem before trusting this
string — run one call against a known non-contract address and log
`error.name`. Do not ship the check unverified.

- [ ] **Step 2: Say what was actually established**

Put the sentence in `lib/accountDiscovery.ts` so it can be tested:

```ts
/**
 * What a discovery pass may claim.
 *
 * Never "none found" while any candidate went unread: that is an assertion of
 * absence built from a failed read.
 */
export function describeDiscovery(
  { verified, unreadable, historyTruncated }:
  { verified: number; unreadable: number; historyTruncated: boolean },
): string {
  const noun = verified === 1 ? 'account' : 'accounts'
  const truncated = historyTruncated ? ' Some older deployments may not be shown.' : ''
  if (unreadable > 0) {
    return `${verified} compatible protected ${noun} confirmed. ${unreadable} could not be checked — Celo did not answer for ${unreadable === 1 ? 'it' : 'them'}, so this list may be incomplete. Try again in a moment.${truncated}`
  }
  return `${verified} compatible protected ${noun} found in Celo history.${truncated}`
}
```

Count `unreadable` in the batch loop and call this instead of building the
string inline. Where the page says *"No compatible protected accounts were
found. Create one to get started."*, suppress that line entirely when
`unreadable > 0`.

- [ ] **Step 3: Test `describeDiscovery`** — zero unreadable reads as today
  (singular and plural); any unreadable says so and never says "found in Celo
  history"; `historyTruncated` appends in both branches.

- [ ] **Step 4: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git add app/lib/accountDiscovery.ts app/test/accountDiscovery.test.ts app/components/AccountsPage.tsx
git commit -m "fix(app): a rate-limited RPC told an owner they had no protected accounts"
```

---

## Task 7: The refuel button must work when the account is nearly empty

### The defect

`components/AgentPanel.tsx:111` sweeps a hard-coded `0.05` and never reads
`protectedBalance`, which is a prop on the same component (`line 71`).

When the contract holds less, `IERC20.transfer` returns false, `sweep` reverts
`TransferFailed`, wagmi does not simulate so `writeContractAsync` still resolves
with a hash, `pollUntil` burns its full 60 seconds, and the owner reads:

> Sent, but the chain has not confirmed it yet. Reload in a moment.

A wait-and-see message for a transaction that can never succeed. Worse, the
button renders *because* `low` is true — at the same moment `AccountOverview` is
saying "Fund the protected account". "The protected account is nearly empty" is a
normal end state for a working account, not an exotic one.

**Files:**
- Modify: `app/lib/gasFloat.ts`, `app/test/gasFloat.test.ts`,
  `app/components/AgentPanel.tsx`

- [ ] **Step 1: Decide the refuel amount as data**

`RESERVE` already lives in `lib/gasFloat.ts` and is the figure this turns on:

```ts
/**
 * What a refuel should actually send, given what the account holds.
 *
 * Sweeping a fixed amount the account cannot cover reverts, and the revert is
 * indistinguishable from a slow chain: the destination balance never rises,
 * so the poll times out and the owner is told to reload. That happens at
 * exactly the moment the button exists for.
 *
 * Below RESERVE a node will not simulate a fee-currency transaction at all,
 * so sending the last few units buys nothing and still costs the owner gas.
 * Say so instead.
 */
export function planRefuel(
  protectedBalance: bigint, requested: bigint,
): { ok: true; amount: bigint } | { ok: false; reason: 'empty' | 'below-reserve' } {
  if (protectedBalance === 0n) return { ok: false, reason: 'empty' }
  if (protectedBalance < RESERVE) return { ok: false, reason: 'below-reserve' }
  return { ok: true, amount: protectedBalance < requested ? protectedBalance : requested }
}
```

- [ ] **Step 2: Use it, and name the amount on the button**

Compute the plan above the JSX, since the label needs it too. In `refuel()`,
before the write:

```ts
      if (!plan.ok) {
        setNote(plan.reason === 'empty'
          ? 'The protected account is empty. Send USDC to it before refuelling the agent.'
          : `The protected account holds ${formatDisplayAmount(protectedBalance, decimals)} ${symbol}, which is not enough for even one agent transaction. Fund the account first.`)
        setBusy(false)
        return
      }
```

Sweep `plan.amount`. Label the button
`` `Send ${formatDisplayAmount(plan.amount, decimals)} ${symbol} for gas` `` so a
partial refuel is not a surprise. Leave the `pollUntil` and the unconditional
`onRefuelled()` exactly as they are.

- [ ] **Step 3: Test it** — zero is `empty`; under `RESERVE` is `below-reserve`;
  exactly `RESERVE` is `ok`; a balance above the request returns the request; a
  balance between `RESERVE` and the request returns the whole balance.

- [ ] **Step 4: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit
git add app/lib/gasFloat.ts app/test/gasFloat.test.ts app/components/AgentPanel.tsx
git commit -m "fix(app): the refuel button reverted in silence when the account was nearly empty"
```

---

## Task 8: Remove the Finder duplicates before one of them is committed

### The defect

Four untracked copies sit in the tree, and one is a live hazard:

| File | What it is |
|---|---|
| `.github/workflows/ci 2.yml` | An older copy of `ci.yml`, missing the comment explaining why `test:e2e` is excluded |
| `app/app/page 2.tsx` | A superseded landing page |
| `mcp/tsup.config 2.ts` | A copy of the bundler config |
| `mcp/test/bundle.test 2.ts` | A copy of the bundle test |

GitHub Actions globs **every** `.yml` under `.github/workflows/`. Committing
`ci 2.yml` doubles CI on every pull request, with stale config.

None is loaded today — Next routes only an exact `page.tsx`, and the vitest glob
needs a `.test.ts` suffix `bundle.test 2.ts` does not have. They are one
`git add -A` away from being.

- [ ] **Step 1: Confirm each is a copy, then delete**

```bash
cd /Users/vanhuy/Desktop/celo
git status --porcelain -- "* 2.*"     # every one must show untracked (??)
diff ".github/workflows/ci.yml" ".github/workflows/ci 2.yml"
diff "mcp/tsup.config.ts" "mcp/tsup.config 2.ts"
diff "mcp/test/bundle.test.ts" "mcp/test/bundle.test 2.ts"
```

Read each diff first. A copy that has diverged is a change somebody made and
forgot, not litter — if one holds content the original lacks, **stop and say so**
rather than deleting it.

```bash
rm ".github/workflows/ci 2.yml" "app/app/page 2.tsx" \
   "mcp/tsup.config 2.ts" "mcp/test/bundle.test 2.ts"
```

- [ ] **Step 2: Make the mistake uncommittable** — append to `.gitignore`:

```gitignore
# Finder duplicates. `.github/workflows/ci 2.yml` would have doubled every CI
# run with a stale copy of the config; the others were dead weight in app/ and
# mcp/. Ignored rather than merely deleted, because the way they appear is a
# copy-paste in a file manager, which will happen again.
* [0-9].*
```

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/vanhuy/Desktop/celo && git status --porcelain   # no "* 2.*" left
cd app && pnpm test && pnpm test:e2e
cd ../mcp && pnpm test
git add .gitignore
git commit -m "chore: drop four Finder duplicates, one of which would have doubled CI"
```

`mcp` runs because two of the four were its files; the run proves nothing
depended on them.

---

# Phase B — correctness on rarer paths

---

## Task 9: An account may have operators the dashboard never shows

### The defect

`lib/feed.ts` `pickOperator` builds the complete set of still-enabled operators
in its `live` map and throws all but the newest away. `AgentAccessPanel` renders
exactly one.

Discovery is bounded twice: `useFeed` scans 24 hours, or from the deploy block,
whichever is narrower. An operator authorised three days ago and never used
emits no log in range and has no localStorage entry — and `operators` is a
mapping, so nothing can enumerate it.

An owner revokes the agent on screen, reads *"No active operator could be
verified for this protected account"*, and a second key still spends to the daily
cap.

This cannot be fully solved from the chain. What it can stop doing is
overclaiming.

**Files:** `app/lib/feed.ts`, `app/test/feed.test.ts`, `app/lib/useFeed.ts`,
`app/app/a/[address]/page.tsx`, `app/components/AgentAccessPanel.tsx`,
`app/lib/accountHealth.ts` (after Task 1)

- [ ] **Step 1:** Replace `pickOperator` with
  ``liveOperators(changes): readonly `0x${string}`[]``, newest first, keeping the
  existing chain-order sort and last-write-per-address semantics exactly. Keep
  the existing comment block and add: *"Returns ALL of them, newest first. It
  used to return only the newest, which is how an account with two authorised
  keys could show one and let an owner revoke it believing the account was
  clear."* Expose `operatorCandidates` from `useFeed`.

- [ ] **Step 2:** In `a/[address]/page.tsx`, build the candidate list as today —
  `feed.operatorCandidates`, `fromFeed`, `fromSetup`, `fromPublicProof`,
  `fromQuery` — dedupe case-insensitively, check each against `operators()`, keep
  the passing ones in order. **Fail-closed is unchanged and must stay:** if any
  read throws, set the list empty, set `operatorCheckFailed`, let the 8-second
  retry run. A partially-read list is not a list. `AgentPanel` keeps taking a
  single operator — render it for `operators[0]`; gas is a property of a wallet,
  not of the set.

- [ ] **Step 3:** `AgentAccessPanel` takes
  ``operators: readonly `0x${string}`[]`` and renders one Authorized row per
  entry, each with its own armed Revoke. The grant form appears when the list is
  empty, as today. Reword both empty states, because absence of a log is not
  absence of an operator:
  - `AgentAccessPanel`: "No operator found in this account's recent activity. The
    contract cannot be asked to list its operators, so one authorised earlier may
    not appear here."
  - `accountHealth`'s `!operator` body: the same statement, in one sentence.

- [ ] **Step 4: Test** `liveOperators` in `test/feed.test.ts`: two grants return
  both, newest first; grant-then-revoke returns neither; revoking one of two
  returns the other; out-of-order arrival still sorts by block then log index;
  empty input returns `[]`. Add the reworded `!operator` case to
  `test/accountHealth.test.ts`.

- [ ] **Step 5: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git commit -m "fix(app): revoking the agent on screen could leave a second operator spending"
```

---

## Task 10: Say "you do not have enough USDC" instead of timing out

### The defect

`app/app/setup/page.tsx:450` `fund()` sends an ERC-20 transfer without reading
the owner's balance, and wagmi's `writeContractAsync` does not simulate. A
transfer larger than the wallet holds is signed, lands, reverts, costs gas, and
surfaces as *"Sent, but the balance has not changed yet."* — true, and useless.
The balance is one `balanceOf` away and the wizard already has `readBalance`.

- [ ] **Step 1:** After the amount parses and **before** `setFundingTarget`:

```ts
      // Read rather than discovered from a revert. wagmi does not simulate, so
      // an over-large transfer is signed, lands, reverts and costs gas -- and
      // then reads as a slow chain, because the destination balance genuinely
      // did not change. One balanceOf turns that into a sentence.
      const available = await readBalance(connected!)
      if (available < amount) {
        setNote(`Your wallet holds ${formatDisplayAmount(available, DECIMALS)} USDC, less than the ${formatDisplayAmount(amount, DECIMALS)} you asked to send. Nothing was sent.`)
        return
      }
```

Placing it before `setFundingTarget(target)` keeps the button out of its sending
state on the early return.

- [ ] **Step 2: Verify and commit.** No test: two lines inside a component, and
  the suite is node-only (spec §2.2). Say that in the commit body rather than
  leaving it unexplained.

```bash
cd app && npx tsc --noEmit && pnpm test
git commit -m "fix(app): a transfer larger than the wallet held was reported as a slow chain"
```

---

## Task 11: Four small defects that each break a stated rule

Grouped because each is a few lines and none needs its own reasoning.

**Files:** `app/lib/useAccountState.ts`, `app/components/Meter.tsx`,
`app/components/DashboardOverview.tsx`, `app/components/AgentPanel.tsx`,
`app/components/landing/ProtectionModel.tsx`

- [ ] **Step 1: The error banner must not blink during an outage**

`lib/useAccountState.ts:58` clears `error` optimistically at the start of every
poll. During a sustained forno failure the dashboard's *"Could not refresh the
account. Showing the last confirmed values."* appears and vanishes every four
seconds. Drop `error: null` from that `setState` — line 91 already clears it on
success, which is the only moment that is true.

- [ ] **Step 2: A meter painted in a hidden tab must not animate**

`components/Meter.tsx:60`'s visibility effect registers a `visibilitychange`
listener and never reads `document.hidden` once. A tab that was **already**
hidden at mount fires no event, so `visible` stays `true`, `animating` stays
`true`, and the SMIL `<animate>` runs for as long as the tab stays hidden — the
opposite of the comment on line 59. The reduced-motion effect three lines above
calls its own `onChange()` at mount; do the same here.

- [ ] **Step 3: Money on screen carries `.num`**

`components/DashboardOverview.tsx:203` `SecurityPolicy` builds "Daily limit" and
"Maximum direct payment" as `${formatDisplayAmount(...)} ${symbol}` and renders
them in a bare `<span>{value}</span>`. `CLAUDE.md`, Conventions: *"Money on
screen uses the `.num` class (mono, `tabular-nums`) so digits do not reflow as
values update live."* These come from the 4-second poll, so they do reflow. Give
the `rows` tuple a third element saying whether the value is money, and apply
`className="num"` on those two.

- [ ] **Step 4: Two type sizes that are off the scale**

`lib/type.ts` is six steps: 44 / 30 / 18 / 14 / 13 / 11.
- `components/AgentPanel.tsx:158` uses `text-lg` — 18px, the right size by the
  wrong route. Replace with `style={{ fontSize: 'var(--t-heading)' }}`.
- `components/landing/ProtectionModel.tsx:28` and `:62` use `text-2xl` — 24px,
  which is **no step**. `docs/design-system.md` §2 lists exactly these ad-hoc
  `text-lg`/`text-2xl` uses as the defect the scale removed. Use `--t-title`
  (30px); §7 bars only `--t-display` from the landing. If 30 reads too loud
  beside the headline, `--t-heading` is the other legal answer — pick one and
  say which in the commit body.

`test/type.test.ts` asserts `globals.css` against `lib/type.ts` and cannot see
Tailwind classes, so this stays enforced by review.

- [ ] **Step 5: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git commit -m "fix(app): an error banner that blinked, a meter that animated unseen, and money that reflowed"
```

---

## Task 12: Send an explicit gas limit on the writes a wallet may fail to estimate

### The defect, stated accurately

Thirteen `writeContractAsync` calls send no `gas`. Only the deploy path carries
one (`DEPLOY_GAS`, `chain.ts:70`).

**The review agent cited the wrong evidence for this**, and the distinction
matters. `CLAUDE.md`'s *"Always send an explicit `gas`"* and its 0.465-USDC
measurement are about **CIP-64 fee-currency sends from the operator**, where a
missing limit makes the node reserve the *block* gas limit in USDC. That is
`GAS_LIMIT` in `sdk/src/policyClient.ts` and it does not transfer here: these
writes are signed by a browser wallet paying gas in CELO, and the wallet shows
the fee before the user confirms.

What **does** transfer is the failure `DEPLOY_GAS`'s own comment records: OKX
Wallet on Celo, 2026-09-04, *"Network fee estimation unsuccessful"*, a fee of
`--`, and a Confirm button that could not be pressed — because the request
carried no `gas` for the wallet to fall back on when its estimator came back
empty. That wallet is on the same chain and the same app; nothing about it is
specific to contract creation. Every one of these writes is exposed to it, and
`setPaused` is the kill switch.

**Files:** `app/lib/chain.ts`, and the thirteen call sites

- [ ] **Step 1: Measure, do not guess.** Against a real account on mainnet, with
  the `.env` sourced:

```bash
set -a; source .env; set +a
cast estimate <ACCOUNT> "setPaused(bool)" true --rpc-url https://forno.celo.org --from <OWNER>
# repeat for setPolicy, setOperator, setAllowlist, setAllowlistEnabled, sweep
cast estimate <TOKEN> "transfer(address,uint256)" <DEST> 1000 --rpc-url https://forno.celo.org --from <OWNER>
```

- [ ] **Step 2:** Add named constants beside `DEPLOY_GAS` in `lib/chain.ts`, each
  carrying its measured figure, the date, and the headroom applied — the shape
  `DEPLOY_GAS` already uses. Unused gas is refunded, so over-estimating costs
  nothing; guessing low turns a working button into a failed transaction.

- [ ] **Step 3:** Pass each at its call site. Do not reuse one constant for all
  seven functions — `sweep` and `setPaused` are not the same transaction, and a
  single shared number stops being a measurement.

- [ ] **Step 4: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git commit -m "fix(app): a wallet whose estimator returns empty could not press Confirm on any owner action"
```

---

# Phase C — decisions, dead code, and the record

---

## Task 13: Decide what happened to the MCP handoff — DECISION REQUIRED

### The defect

`components/McpHandoff.tsx` and `lib/mcpJson.ts` are referenced only by
`test/mcpJson.test.ts` (24 tests). No page renders either. Both e2e specs
*assert their absence*: `e2e/landing.spec.ts:9` requires `/MCP configuration/i`
to have count 0, `:61` requires `/mcpServers/` to have count 0. Stage 4 of the
wizard says integration "is a separate integration journey and is not required
to complete this setup."

The removal was deliberate. The documentation did not follow:

- `README.md` still describes the wizard emitting a `.mcp.json`.
- `docs/RESUME.md` still says *"`app/lib/mcpJson.ts` is still the only builder;
  the landing page and `/setup` both render through it, so they cannot drift
  apart."* They have drifted apart: neither renders it.

A reader following the README finishes the wizard and finds no configuration
anywhere in the product — only a `docs/mcp-setup.md` link in the site footer.

**This task cannot be executed without a decision.** The branches touch
different files and one changes the e2e contract.

**Branch A — delete (recommended).** The wizard's own copy says integration is a
separate journey, `leash-agentpay` is on npm, and `docs/mcp-setup.md` is written
for a stranger. Carrying a builder nothing builds is how the README came to
describe an app that does not exist.
- Delete `app/components/McpHandoff.tsx`, `app/lib/mcpJson.ts`,
  `app/test/mcpJson.test.ts` (the unit total drops by 24).
- Correct the `README.md` quick-start paragraph and the `docs/RESUME.md`
  sentence quoted above.
- Leave the e2e assertions — they become what keeps the block from returning by
  accident.

**Branch B — restore it on stage 4.** If the handoff is meant to exist, the gap
is that a finished setup hands over an account address and nothing else.
- Render `<McpHandoff>` in the stage-4 panel.
- `e2e/landing.spec.ts:9` must be inverted, and `FEE_ADAPTER` must come from the
  on-chain directory the wizard already validates against — not hard-coded.
- Keep `ATTRIBUTION_TAG_SHAPE`; it is what stops a `.mcp.json` that looks
  finished and throws before its first tool call.

- [ ] **Step 1: Get the decision in writing from the maintainer.** Do not pick
  one. Record which branch and why in `docs/RESUME.md`.
- [ ] **Step 2: Execute that branch only.**
- [ ] **Step 3: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
```

Branch A: `git commit -m "chore(app): delete the MCP handoff builder nothing renders, and the docs that promised it"`
Branch B: `git commit -m "feat(app): hand the finished setup its .mcp.json again"`

---

## Task 14: Delete what has no caller, and consolidate six copies of one ABI

### The defects

**Five dead exports and one dead local.** Verified by grep across `app/`:

| Symbol | State |
|---|---|
| `AccountsPage.tsx:130` `refresh()` | Declared, never referenced in the JSX below it. `tsconfig` does not set `noUnusedLocals`, so nothing catches it |
| `accountRegistry.ts:69` `forgetPolicyAccount` | Only `test/accountRegistry.test.ts`. The "remove this account" affordance it backed is gone |
| `proofs.ts:16` `shortHash` | Only `test/proofs.test.ts`, since `landing/ProofTable.tsx` was deleted |
| `PROOFS[1]`, `PROOFS[3]` | `SecurityBoundary.tsx:18` renders only indices 0, 2 and 4 |
| `leash.recipientMode.*` | Written at `setup/page.tsx:325`, `:345`, `:393`; **read nowhere**. On reload the mode is re-derived from `allowlistEnabled` off the chain (`page.tsx:207`), which is the correct source |

**Six hand-written ABI fragments for one non-upgradeable contract:**
`OWNER_AND_PAUSED_ABI` (`useAccountState.ts:6`), `OPERATOR_ABI`
(`a/[address]/page.tsx:36` **and** `AgentAccessPanel.tsx:14`, with different
shapes), `POLICY_ABI` (`LimitsDrawer.tsx:12`), `SETUP_ABI`
(`setup/page.tsx:37`), `VERIFY_ABI` (`AccountsPage.tsx:25`). `lib/contract.ts`
already exports the full ABI `forge build` copies out of `contracts/out`, and
`@leash/sdk` exports `spendPolicyAccountAbi` — which `useAccountState.ts`
already imports for two of its six reads before hand-rolling the rest beside it.
`CLAUDE.md` warns that `contract.ts` must be regenerated after any contract
change; six divergent copies is six places that can miss it.

- [ ] **Step 1:** Delete `refresh()`, `forgetPolicyAccount`, `shortHash` and their
  tests. For `PROOFS[1]` and `PROOFS[3]`, **ask before deleting** — `lib/proofs.ts`
  says these are "the five things this project has proven rather than asserted"
  and `README.md` mirrors them as prose. Dropping two changes a claim, not just
  code. Rendering all five is the other legal answer.

- [ ] **Step 2:** Remove the three `leash.recipientMode` writes. Leave
  `leash.recipient.<account>` (`page.tsx:394`) — it is read at `page.tsx:212`.

- [ ] **Step 3:** Replace the six ABI fragments with `spendPolicyAccountAbi` from
  `@leash/sdk` wherever it covers the call, keeping a local fragment only where
  the SDK's ABI genuinely lacks the entry — it carries functions and errors but
  **no events**, which is why `useFeed.ts` has its own `EVENT_ABI` and must keep
  it. The ERC-20 fragments are a different contract and stay. Run the full suite
  after each file, not once at the end: an ABI swap that compiles can still read
  the wrong slot.

- [ ] **Step 4: Verify and commit**

```bash
cd app && pnpm test && npx tsc --noEmit && pnpm test:e2e
git commit -m "chore(app): delete five exports with no caller and six copies of one contract's ABI"
```

---

## Task 15: Put the real numbers in the documentation

### The defect

`CLAUDE.md` says the app suite is 201 and `test:e2e` is 8. `docs/RESUME.md` says
201 and 10. Measured 2026-09-09: **207 and 13**. This is the staleness
`docs/RESUME.md` warns about twice in its own text.

- [ ] **Step 1:** Run every suite and read the output. Write **those** figures —
  not the ones above, which will be wrong by the time this task runs, because
  Tasks 1–14 add and remove tests:

```bash
cd app && pnpm test && pnpm test:e2e
cd ../sdk && pnpm test
cd ../mcp && pnpm test
cd ../contracts && forge test
```

- [ ] **Step 2:** Update the command block in `CLAUDE.md` and the suite table in
  `docs/RESUME.md`. `CLAUDE.md`'s list is also missing `test:e2e` for `app`; add
  it with its real count.

- [ ] **Step 3:** Add a 2026-09-09 entry to `docs/RESUME.md` naming which tasks
  of this plan landed and which did not — an honest boundary rather than an
  implied one. If Task 13 was left on its decision, say so.

- [ ] **Step 4: Commit**

```bash
git add app/app/setup/page.tsx CLAUDE.md docs/RESUME.md
git commit -m "docs: the app suite is not 201 tests, and one storage key had no reader"
```

---

## What this plan does not fix

- **The allowlist still cannot be enumerated.** Task 1 makes the app stop
  claiming otherwise; it does not let an owner see which payees are approved. A
  real answer needs either an `AllowlistChanged` history walk (a second getLogs
  window, at the same 5,000-block cost per day) or a contract v2 with an
  enumerable set. Both are their own spec.
- **The operator list is still bounded by the feed window.** Task 9 stops the
  overclaim and shows every operator it *can* see. One authorised outside the
  window and never used stays invisible while `operators` is a plain mapping.
- **Nothing here is tested against a wallet.** Tasks 1, 2, 5, 7, 9, 10 and 12
  change write paths or the forms that feed them. `docs/RESUME.md` records that
  the 2026-09-04 wallet session found four defects no review had caught, three
  of them silent. Clicking these paths with a real wallet is the check this plan
  cannot perform — and "limits from the dashboard" was already the one
  outstanding item on that list, which Task 2 now changes.
- **Three fixes have no unit test and say so:** Task 4 (assignment order inside a
  hook), Task 5 (three component effects) and Task 10 (two lines in a component).
  Each carries a manual verification step. Do not mark them done without
  performing it.

## Order and stopping

**Phase A (Tasks 1–8) is the batch worth doing as one sitting.** Six of the
eight are the app asserting something it never established, which is the one
failure mode this project has repeatedly paid for; the other two are a rescue
button that fails when it is needed and a file that would double CI. Stopping
after Task 8 leaves an app that is internally consistent rather than
half-migrated.

Phase B (9–12) is correctness on rarer paths. Phase C (13–15) is a blocked
decision, a dead-code sweep and the record. Task 13 can be skipped entirely
without touching anything else. **Task 15 runs whenever you stop**, and its
numbers must come from a run made after the last task you completed — never from
this document.
