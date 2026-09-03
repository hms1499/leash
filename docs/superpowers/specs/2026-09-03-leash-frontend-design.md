# Leash Frontend — Design Spec

**Date:** 2026-09-03
**Status:** Approved. Supplements `2026-09-01-leash-design.md`, which stays the
binding authority for everything this document does not touch.
**Supersedes** in that document: §2.1b (was OPEN) and the palette half of §4.1.
Both now point here.
**Covers:** W5 (frontend), the `pause()` UI gap, the `.mcp.json` handoff,
`examples/` (`T6.1`), and the two chain-level gaps found 2026-09-02.
**Does not cover:** W6 (demo video, AskBots rounds, group onboarding, submission).
That plan is written after this one ships, because the video script depends on
what the UI actually looks like.

---

## 1. Decisions taken

Recorded so they can be re-argued rather than re-discovered.

### 1.1 Per-user deployment: direct deploy. §2.1b resolved.

The frontend deploys `SpendPolicyAccount` via wagmi `deployContract`, owner set
to the connected wallet. No factory, no minimal-proxy clones, no on-chain
registry.

A factory is the better product — cheaper per user, and a registry means the UI
can find a wallet's accounts without being told. It was rejected for v1 on time:
it is a new contract to write, test and deploy, and that budget buys more as UI.
The discovery problem it would have solved is solved instead by §2.2.

### 1.2 The account address lives in the URL, and the dashboard reads without a wallet.

`/a/<address>` renders in full for a visitor with no wallet connected, reading
the chain directly. Connecting only unlocks writes, gated on
`owner() === connectedAddress`.

Two things fall out of this, and both are the reason for the choice:

- **The URL is the registry.** Direct deploy leaves the user holding an address
  and nothing to do with it; a route parameter plus `localStorage` closes that
  hole for the cost of a route parameter.
- **The demo link works for someone with no wallet.** A judge opens the
  submitted URL and sees a live account. This is also what makes the single
  Playwright smoke test possible (§7).

The rejected alternative was a wallet-gated SPA: a simpler permission model, but
a dead link for anyone without a wallet and nothing shareable as evidence.

### 1.3 There is no history of blocked spends, and the UI must not invent one.

"Spends *and blocks*" is the second half of the product's claim, so the first
draft of this spec gave the feed a Celoscan proxy route to fetch failed
transactions. **That was built on a false premise.** Checking the code settled
it: `mcp/src/tools/pay.ts` calls `leash.preCheck`, which is a `staticcall`. When
the policy refuses, the tool returns a structured refusal and **no transaction is
ever sent**. A blocked spend does not reach the chain, so there is nothing on
Celoscan to fetch.

That is a property worth keeping, not a defect — a refused payment costs no gas,
which is exactly what the `staticcall` pre-check was built to buy
(`2026-09-01` §2.2, decision 4). But it means an on-chain "blocked history" does
not exist. Only three things ever land as a revert: one deliberately allowed
through as evidence, a rare race where state changed between the pre-check and
the block, and a transaction sent out of band without the SDK.

So the feed shows on-chain truth only — `Spent`, `ToppedUp`, `PolicyChanged`,
`PausedSet` — and the wall is expressed **predictively instead of historically**:
the meter carries a band reading *"next spend over 0.09 will be refused"*,
derived from `remainingToday()` and `limits().perTx`. No logs, no proxy, correct
at every moment, and it states the limit **before** money moves rather than
after.

The blocked moment in the demo is therefore the meter striking its frame
alongside the agent's own terminal printing the refusal JSON — which is more
legible on video than a table row, and true.

Two consequences: `2026-09-01` §2.3's "no backend, no database" survives intact
with no deviation, and the 2h earmarked for the proxy is returned to the budget.

Client-side block scanning was considered and rejected independently: it needs
per-block receipt fetches over the window, which forno will not serve at that
rate.

### 1.4 Visual direction: Van Gogh held, palette moved to *Café Terrace at Night*.

`2026-09-01` §4.1's discipline stands unchanged — **painterly in the chrome,
clinical in the data**, and its three named failure modes are still forbidden
(texture behind numerals, script type, a painting used as wallpaper).

What changes is which painting. The ground is warm teal night with gaslight
amber, not cold indigo with chrome yellow. Chosen over three alternatives shown
side by side in the same layout: *Almond Blossom* (light, most conventionally
corporate), *Wheatfield* (yellow as ground — strongest Celo tie, highest risk),
and a near-black restrained scheme (safest, least distinctive).

**Consequence, stated because it is a real cost:** §4.1 justified chrome yellow
partly as a free bridge to Celo's brand colour. Café Terrace's amber `#F2B441`
is not Celo yellow, so that bridge weakens on a track judged by Celo. It is
repaired by keeping verified Celo yellow in exactly two places — the terminal
stop of the meter's gradient, and the primary action button — while amber
carries the general chrome.

The Celo hex **must be read from Celo's brand kit at build time and never
guessed**. It is not recorded in this document because it has not been verified.

### 1.5 The signature meter is the slim current, not the impasto variant.

`2026-09-01` §4.1 promised one signature moment: a current that grows turbulent
approaching the cap and stops dead against the frame. It is built as a slim
strip pinned under the header, animated with a single SVG
`feTurbulence` + `feDisplacementMap` filter whose displacement scale is driven
by percentage used. At the cap the animation freezes and the frame goes
vermilion.

Two richer variants were built and rejected:

- **Expanding hero** — slim when scrolled, a 72px panel at the top of the page.
  More room for the swirl, at the cost of a transition to get right.
- **Impasto** — one brush stroke per spend, so the bar is also a chart. The best
  idea of the three and the one rejected on robustness: it is the only variant
  that **depends on log scanning**, and logs are the best-effort source. The
  money shot cannot be the fragile component.

The slim current reads only `remainingToday(token)` and `limits(token)`. It is
correct even when the feed is empty.

### 1.6 App copy is English.

Every string rendered by the app is English. This document and the plans are
English for the same reason the rest of the repo is.

### 1.7 The operator gas-float gap is fixed in the UI, not the contract.

`sweep(token, operator, amount)` already lets the owner refuel the agent, and
the owner is deliberately unconstrained by policy. The deadlock — an operator
whose stablecoin hits zero cannot pay the gas to call `topUpOperator` — is
therefore a missing screen, not a missing function.

The dashboard reads the operator's balance, converts it to **"about N
transactions left"** using measured costs (~0.0028 USDC spent per transaction,
~0.0046 reserved), and offers the owner a one-click refuel when it runs low.

A permissionless `refuelOperator` in the contract was rejected: new code and a
new attack surface for a problem the owner can already solve, and it would grow
the redeploy beyond one line.

---

## 2. Architecture

### 2.1 Stack

`app/` is Next.js (App Router) + TypeScript + Tailwind, added to the existing
pnpm workspace — `pnpm-workspace.yaml` already lists `app`. It consumes
`@leash/sdk`, which ships raw TypeScript, so `transpilePackages: ['@leash/sdk']`
is required. wagmi v2 on viem v2, pinned to the same major as the SDK's
`viem ^2.21.0`; two viem copies in one bundle is a real failure mode here.

**No RainbowKit or ConnectKit.** Their modals are instantly recognisable as
templates, which works against the one thing §4.1 is trying to buy, and they
interfere with MiniPay's auto-connect. The app uses wagmi's `injected()`
connector behind a hand-built connect button. MiniPay is an in-app browser that
injects `window.ethereum` with an `isMiniPay` flag; when that flag is present the
app auto-connects and hides every other option.

Deployed on Vercel. Mobile-first, because MiniPay is a phone.

### 2.2 Routes

| Route | Purpose |
|---|---|
| `/` | Onboard: connect → deploy → add agent → set limits → fund → `.mcp.json` |
| `/a/<address>` | Dashboard: meter, feed, policy editor, stop |

`/` checks `localStorage` for a previously deployed account and offers to open
it directly.

### 2.3 Two data sources, deliberately separated

| Surface | Source | Character |
|---|---|---|
| Allowance meter + predictive band | `remainingToday(token)`, `limits(token)` | **Authoritative.** Two view calls. No log dependency. |
| Spend feed | `getLogs` over a bounded block window | Best-effort |

The separation is the point: the component the demo rests on must not fail when
log scanning does.

**`limits().spentToday` is stale once the UTC day rolls over** — the contract
only resets it inside `_consume()`. Never read it directly. Derive
`spent = daily − remainingToday()`, which is correct by construction because
`remainingToday()` does the day comparison itself.

Live updates use `watchContractEvent` in polling mode at roughly 4s against
Celo's ~1s blocks (measured against forno on 2026-09-03: 10,000
blocks spanned exactly 10,000 seconds — an earlier version of this document
said ~5s, and the feed inherited the error, scanning 14.4 hours while telling
the reader it had covered three days), re-reading `remainingToday()` on the same tick. No
websockets — forno is not dependable there.

A block count on Celo is therefore a second count, and any history window is
`(window ÷ 5,000)` sequential `getLogs` calls, because forno refuses a wider
range than 5,000 blocks — 10,000 returns "Invalid parameters were provided to
the RPC method". A day of history costs 18 round trips. Whatever window is
chosen, the empty state must name the span actually scanned.

`fromBlock` for log scanning comes from the deploy receipt, stored alongside the
address in `localStorage` and carried in the URL. For an address the app has
never seen, it falls back to a fixed recent window (default ~3 days, fetched in
chunks with retry). The feed is a live feed, not an all-time ledger, and is
labelled as such.

### 2.4 Writing to the chain

After any write, **wait on the condition, never on the receipt** — forno is
load-balanced and will serve a stale read after a confirmed transaction. Every
write path polls the value it changed until it changes.

The app never sets `feeCurrency`. Users pay their own gas through their own
wallet; MiniPay handles stablecoin gas itself. This keeps forno's
non-deterministic fee-currency rejections out of the app entirely.

---

## 3. Design system (`T5.0`, runs before any screen)

One file of CSS custom properties. Every screen consumes it; nothing hardcodes a
colour.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0E1F2E` | Night ground |
| `--panel` | `#162D40` | Cards, header band, meter strip |
| `--well` | `#091822` | Meter track |
| `--line` | `rgba(214,190,140,.22)` | Warm hairline borders |
| `--text` | `#F2E9D8` | Cream foreground |
| `--dim` | `#8FA6B5` | Labels, timestamps |
| `--amber` | `#F2B441` | Gaslight accent — general chrome |
| `--celo` | *verified at build time* | Meter gradient terminus, primary action only |
| `--ok` | `#5FA98C` | Within limit |
| `--bad` | `#D9534F` | Blocked, paused, the frame |

Meter fill gradient runs `#1B4A63 → #3E86A0 → --celo`.

**Type.** One grotesk for UI, one mono for numerals. Never script. Every
monetary figure uses `tabular-nums`, so digits do not shift width as values
update live.

**Motion.** The ground drifts continuously; data snaps. That contrast is the
product's thesis rendered as motion, not decoration. Two non-negotiable guards:
honour `prefers-reduced-motion`, and pause the filter animation when the tab is
hidden. A continuously running `feTurbulence` is the single most expensive thing
on this page and MiniPay runs on phones.

---

## 4. Dashboard — `/a/<address>`

Layout: feed is the page; the meter is a pinned strip; controls sit one layer
back in a drawer.

**Header band.** `LEASH` · truncated address (click to copy, links to Celoscan) ·
network badge · `STOP`. When paused, the entire band turns `--bad` and the meter
goes flat — a state change large enough to read on video.

**Meter strip.** Pinned below the header (§1.5), carrying the predictive band
from §1.3: *"next spend over 0.09 USDC will be refused"*, the smaller of
`remainingToday()` and `limits().perTx`. When the daily allowance is exhausted
it reads *"the allowance is spent — resets at UTC midnight"*, matching the
wording the MCP server already returns to the agent.

**Feed.** Newest first. Each row: status dot, what happened, amount, relative
time, and a link to the transaction. Rows are on-chain events only — a refused
spend never reaches the chain (§1.3), so the feed never shows one. A revert that
*does* land is rendered `--bad` with the amount struck through and the custom
error named (`PerTxCapExceeded`, `DailyCapExceeded`, `PayeeNotAllowed`).

**`Limits` drawer.** Per-transaction cap, daily cap, save. Values entered in
human units and converted using the token's decimals. Owner only; others see the
same numbers read-only.

**Agent panel.** Operator address, its stablecoin float, "about N transactions
left", and the owner's refuel button when low (§1.7).

**`STOP`.** `setPaused(true)` — owner only, and a real transaction. No modal:
modals kill the pace of a demo. Two beats instead — `STOP` becomes
`CONFIRM STOP` for three seconds, then sends. `RESUME` reverses it.

**Empty state, which matters more than it sounds.** A freshly deployed account
has no policy, and every operator path reverts `TokenNotConfigured` until the
owner calls `setPolicy`. The dashboard must say exactly that and link to the
step that fixes it, rather than rendering an empty list.

---

## 5. Onboard — `/`

A linear wizard. Four transactions, each showing its own state.

1. **Connect.** Injected connector; auto-connect under MiniPay.
2. **Deploy.** `deployContract`, owner = connected wallet. Shows the measured
   cost (~$0.013). On success, stores `{address, deployBlock}` and routes to
   `/a/<address>`.
3. **Add your agent.** `setOperator(agent, true)`. Carries an explicit warning
   that this address **must** be the one registered as `agentWalletAddress`:
   getting it wrong silently voids x402 attribution with no error anywhere
   (`2026-09-01` §2.4).
4. **Set limits.** `setPolicy(token, perTx, daily)`, human units in, atomic
   units out.
5. **Fund.** Shows the account address and a QR, then polls the balance until it
   is non-zero — the condition, not a receipt.

### 5.1 The handoff

The wizard ends by emitting a filled-in `.mcp.json` block with a copy button.
This is the moment a viewer becomes a user, and it is the reason Onboard exists.

| Value | Where it comes from |
|---|---|
| `LEASH_ACCOUNT` | The account just deployed |
| `SPEND_TOKEN` | The token whose policy was set in step 4 |
| `FEE_ADAPTER` | Read from the on-chain `FeeCurrencyDirectory` via the SDK's `pickFeeAdapter`. **Never hardcoded** (`2026-09-01` §2.5) |
| `ATTRIBUTION_TAG` | Asked for, with a link explaining how to obtain one |
| `OPERATOR_PK` | **Left as a placeholder, with a warning** |

**The app never asks for a private key, at any step.** The operator key is the
one value the user must paste themselves, locally.

Prose comes from `docs/mcp-setup.md`; the screen only fills in values.

---

## 6. Contract change and migration

**The change is one line: delete `receive() external payable {}`.**

There is no `fallback`, so a plain CELO transfer to the account then reverts
instead of being locked forever. A Foundry test asserts the native send fails.
The existing 30 tests must stay green.

New bytecode means a new address. The live demo instance
`0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` runs the old code, and shipping
users different code than the one every proof link points at does not survive
scrutiny. So the demo instance is migrated:

1. Deploy the new account with the same owner.
2. `sweep` the USDC balance from the old account to the new one.
3. `setOperator` and `setPolicy` on the new account.
4. Verify the source on Celoscan.
5. Update `docs/deployments.md` and `.env`, marking the old address
   **superseded** rather than deleting it. The existing proof transactions
   remain valid history and stay recorded.

This happens **first**, before any app work, because everything downstream points
at the new address — and it must be done before filming.

Cost: about $0.013 plus one sweep transaction.

**The ERC-8004 registration is unaffected.** Only the account contract moves;
the operator EOA — which is what is registered as `agentWalletAddress`, and what
x402 attribution keys off — does not change. agentId 9804 stays valid. The
`.env` update touches `LEASH_ACCOUNT` only, which the MCP server and both gate
test suites read.

---

## 7. Testing

**Contract.** The new native-send test, plus the existing 30.

**App logic — no wagmi mocking.** Mocking a wallet stack tests the mock. Pure
functions are extracted and unit-tested with Vitest instead:

- decimal conversion both directions
- `spent = daily − remaining`, and percentage used
- the predictive band's threshold: `min(remainingToday, perTx)`, including the
  exhausted case where it is zero (§1.3)
- `.mcp.json` generation, including that `OPERATOR_PK` is never populated
- address validation and truncation
- feed row formatting
  - ~~including each custom error name~~ — **struck 2026-09-03, unbuildable
    as specified.** A reverted transaction emits no logs, so `getLogs` can
    never surface a custom error and `describeLog` correctly has no branch
    for one. The wall is stated by the meter before money moves, which is
    §1.3's whole point. Do not add a test for this; there is nothing to
    format.

**One Playwright smoke test.** It opens `/a/<a live account>` with no wallet and
asserts the meter renders a number. That is precisely the judge's path, and it
is testable only because of §1.2.

**Definition of done.** All four suites green, `tsc --noEmit` clean in `sdk`,
`mcp`, `spikes` and `app`, and `next build` succeeding. Evidence pasted, not
asserted.

---

## 8. Task shape and budget

| | Task | Est |
|---|---|---|
| `T0` | Remove `receive()`, test, redeploy, sweep, verify, update docs | 2h |
| `T1` | App scaffold, workspace wiring, wagmi + MiniPay connector | 2h |
| `T2` | Design system tokens (incl. verifying the Celo hex from the brand kit) + turbulence meter component | 4h |
| `T3` | Dashboard read path: meter + feed — **first filmable moment** | 8h |
| `T5` | Limits drawer + `STOP` / `RESUME` | 3h |
| `T6` | Onboard wizard + `.mcp.json` handoff | 6h |
| `T7` | Operator float warning + owner refuel — **P1** | 2h |
| `T8` | `examples/` demo agent | 2h |
| `T9` | Vercel deploy + smoke test | 2h |

**31h against the 25h `2026-09-01` budgeted for W5 plus `T6.1`.** The overrun is
stated rather than hidden. `T7` is the only declared P1 and is the cut line;
`T4` was dropped entirely when §1.3's premise turned out to be false, returning
its 2h. Task IDs are left unrenumbered so they keep matching the discussion that
produced them. Order respects the spec's constraint that `T5.0` precedes `T5.2` and
`T5.2` precedes `T5.3`: after `T3` there is always something filmable, even if
everything after it burns.

---

## 9. `examples/` (`T6.1`)

One runnable script against `@leash/sdk`: read status, spend three times under
the cap, then attempt a fourth over the cap and print the refusal.

**No LLM in the loop.** A demo that needs a model to cooperate is a demo that
cannot be reshot. The README shows the same sequence as MCP tool calls, which is
what a reader copies.

It moves real money, so it sits behind an explicit environment variable in the
same style as the existing gate tests.

---

## 10. Out of scope

Analytics charts, history export, team management, settings pages, the Approval
Inbox (`T5.5`, cut in `2026-09-01`), a factory contract (§1.1), ERC-1271
pre-authorization (`2026-09-01` §2.1, resolved), and all of W6.
