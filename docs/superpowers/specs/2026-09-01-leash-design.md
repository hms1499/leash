# Leash — Design Spec

**Date:** 2026-09-01
**Status:** Approved for planning
**Hackathon:** Celo "Agents at Work" (2026-08-28 → 2026-09-14 09:00 GMT)
**Primary track:** `judges-favorite` · **Secondary:** `askbots-growth`

---

## 1. Problem and Pitch

Handing a wallet to an AI agent today means handing over unbounded spending
authority. Existing safety measures live in the prompt or the SDK — layers the
agent itself can talk its way around, and layers that vanish the moment the
agent's key leaks.

**Pitch:** *Give an AI agent a wallet without trusting it. Spend limits and
payee allowlists are enforced on-chain, not by a prompt.*

### Why this fits Judges' Favorite

The track rewards "the most innovative solution built on Celo primitives with a
real distribution channel behind it."

- **Primitive.** Fee abstraction: the agent holds **zero CELO** and pays gas in
  a stablecoin. Hackathon rules state fees you pay yourself count in your
  favour, so this is both narrative and score.
- **Innovation.** Agent spending controls are currently a prompt-layer concern.
  Enforcing them at the contract layer is a difference explainable in 30 seconds.
- **Distribution.** The natural customers are other teams in this hackathon.
  Every team is required to register an `agentWalletAddress`, and their wallets
  already have pre-2026-08-28 Celo history — which means they pass the
  organiser's "independent parties" audit by construction.

### Scoring strategy

Two tracks only. Rules note that 47 of 60 projects last time entered three or
more tracks and clustered in the bottom two grades.

- `judges-favorite` (primary) — all build effort.
- `askbots-growth` (secondary) — ~7h, and not separate work: AskBots reviews
  Leash's own code and scores the *delta* between two review rounds, so acting
  on the reviews improves the primary submission too.
- `cpay-feedback` — **not registered.** It is genuinely separate work (testing
  someone else's product) at 8-10h we do not have. Still tick `cpayBetaOptIn`
  at registration: it is free and keeps the door open if the build finishes early.

---

## 2. Architecture

### 2.1 The central constraint: x402 and contract accounts

x402 settles via EIP-3009 `transferWithAuthorization`: the payer signs
off-chain and the facilitator submits the transaction. Our funds live in a
contract, and a contract cannot produce an ECDSA signature.

USDC's `transferWithAuthorization` is believed to use plain `ecrecover` with no
ERC-1271 support, which would make a smart account unable to pay x402 directly.
**This is unverified and is spike `T0.2`, scheduled first.** The design absorbs
either answer through two spend paths:

| Path | Used for | Enforced by contract |
|---|---|---|
| **A. `execute()`** | On-chain spending: stablecoin transfers, contract calls | Payee allowlist + per-tx cap + daily cap — all three |
| **B. Metered top-up** | x402, where the agent EOA must sign for itself | Daily cap only — the agent cannot draw more than X per day |

Path B is a weaker guarantee but still a real leash: the agent is hard-capped on
how much it can ever reach. Stating this limitation openly in the demo is an
asset — the judges are actively auditing for projects that overstate their
guarantees.

### 2.2 Contract

```solidity
contract SpendPolicyAccount {
    address owner;                          // human EOA
    mapping(address => bool) operators;     // agent EOAs (multiple allowed)
    bool paused;                            // kill switch

    struct Limit { uint256 perTx; uint256 daily; uint256 spentToday; uint64 day; }
    mapping(address token => Limit) limits;

    mapping(address => bool) payeeAllowlist;
    bool allowlistEnabled;

    // Path A — enforces all three layers
    function execute(address token, address to, uint256 amount, bytes calldata data)
        external onlyOperator notPaused;

    // Path B — enforces daily cap only; funds move to the operator EOA
    function topUpOperator(address token, uint256 amount)
        external onlyOperator notPaused;

    // DESCOPED from v1 (T1.4 cut). Shown for design completeness only.
    // Over-limit spend, approved by an EIP-712 owner signature
    function executeWithOwnerSig(Request calldata r, bytes calldata sig) external;

    // Owner: setPolicy, setAllowlist, addOperator, removeOperator, pause, sweep
}
```

**Decisions taken:**

1. **Cap denomination: per-token, no oracle.** `mapping(token => Limit)`. The UI
   displays USD by restricting spendable tokens to stablecoins and treating them
   as 1:1 — the parity assumption lives in the UI, never in the contract. A
   global USD cap via Mento oracles was rejected: it adds an oracle dependency
   and a manipulation surface to price assets that are ~$1 by construction.
   Accepted trade-off: an agent could exhaust the USDC cap *and* the cUSD cap in
   the same day.
2. **Daily window: UTC calendar day** (`block.timestamp / 1 days`), not a rolling
   24h window. A rolling window needs a ring buffer; a calendar day needs one
   `uint64` comparison. The difference is immaterial for this product.
3. **Funds are held in the contract**, not spent via allowance from the owner's
   EOA. If the owner key leaks, the vault still has `pause()` and the policy.
4. **Policy violations revert** with custom errors (`DailyCapExceeded(spent, cap)`)
   rather than silently returning false. The SDK `staticcall`s a pre-check so
   normal operation wastes no gas — but demos deliberately let one revert land
   on-chain, because a red transaction on Celoscan is stronger evidence than any
   claim.

### 2.3 Events

`Spent` · `ToppedUp` · `PolicyChanged` · `Paused`
(`ApprovalRequested` ships only if the descoped approval flow is revived.)

The frontend reads event logs directly. **No backend, no database.** This is why
the Live Spend Feed costs ~8h rather than ~20h.

### 2.4 Attribution — the silent-failure zone

- Path A and Path B transactions are sent by our own code, so they carry
  `toDataSuffix(attributionTag)` and score.
- x402 settlements are submitted by the facilitator and cannot carry the tag;
  they are attributed via `agentWalletAddress` instead.

**Therefore the `agentWalletAddress` declared at registration MUST be the
operator EOA, not the contract address.** Getting this wrong silently voids all
x402 activity — there is no error, the leaderboard simply reads zero.

SDK API (verified against `@celo/attribution-tags@0.3.0`):
`toDataSuffix()`, `verifyTx()`, `fromDataSuffix()`.

### 2.5 Fee abstraction

The agent EOA sends transactions with `feeCurrency` set to a whitelisted
stablecoin adapter, so it never needs to hold CELO. The adapter list **must be
read from the on-chain `FeeCurrencyDirectory` at build time** — never hardcoded
from memory. This is spike `T0.1`.

---

## 3. Agent Layer

### 3.1 SDK

Wraps every outbound transaction so attribution and fee currency are applied
with no bypass path, and exposes a policy client that pre-checks via
`staticcall` before spending gas.

### 3.2 x402 buyer

Fetches 402-gated URLs and settles payment, drawing funds through Path B.

### 3.3 MCP server — this is the funnel, not an accessory

Other teams will not read the contract. They will paste a few lines into
`.mcp.json` and tell their agent to spend. The MCP server is therefore the real
product surface.

| Tool | Purpose | Priority |
|---|---|---|
| `leash_status` | Balance, remaining daily allowance, active policy | P0 |
| `leash_pay` | On-chain payment to a payee (Path A) | P0 |
| `leash_fetch` | Call an x402-gated URL, paying automatically (Path B) | P0 |
| `leash_request_approval` | Request owner approval for an over-limit spend | Cut |

**Critical UX rule:** when policy blocks a call, the tool returns structured
JSON an LLM can act on —
`{ error: "daily_cap_exceeded", spent: "18.40", cap: "20.00", resets_in: "5h12m", suggestion: "..." }`
— never a raw revert hex. An agent can route around the first and stalls on the
second. cPay itself ships "JSON errors written for an LLM to troubleshoot", so
matching that shape is aligned with the organisers' own direction.

---

## 4. Frontend

Three screens in v1 (a fourth is descoped below). Next.js + wagmi/viem + Tailwind, deployed on Vercel,
**mobile-first** so it works inside the MiniPay in-app browser.

| Screen | Role | Priority |
|---|---|---|
| **Onboard** — connect, deploy account, fund it | The distribution funnel; another team is running in 2 minutes | P0 |
| **Live Spend Feed** — spends, blocks, real-time allowance meter | The demo money-shot. Built first | P0 |
| **Policy Editor** — daily cap, per-tx cap | Reason the product exists. v1 is three number inputs and a save button; the allowlist is managed through MCP/CLI | P0 |
| **Approval Inbox** — pending over-limit requests | Closes the human-in-the-loop story | Cut |

Explicitly out of v1: analytics charts, history export, team management,
settings pages.

### 4.1 Visual direction: Van Gogh

A financial control panel is judged by a human on this track. Sixty projects
will submit near-identical shadcn dashboards; visual distinctiveness is a real
asset here.

**Why the reference is not arbitrary:**

- Chrome yellow is Van Gogh's signature colour, and yellow is Celo's brand
  colour. The bridge needs no explanation — it simply reads as native to Celo.
  *(Pull the exact hex from Celo's brand kit at build time; do not guess.)*
- *Starry Night* is turbulence held inside a frame. Leash is an autonomous,
  unpredictable thing held inside a limit. The link is conceptual, not decorative,
  and it is one sentence in the demo.

**How it fails — guard against all three:**

- Swirling texture behind numbers → illegible → the product is broken.
- A handwriting or script font → kitsch.
- A Van Gogh painting used as a background image → reads as clip art, and
  undermines trust in a product that custodies money.

**Discipline: painterly in the chrome, clinical in the data.**

| Layer | Treatment |
|---|---|
| Background, card edges, header band | Impasto via a single SVG `feTurbulence` + `feDisplacementMap` filter — not hand illustration |
| Palette | Night indigo/cobalt ground · chrome yellow accent (= Celo yellow) · viridian = within limit · vermilion = blocked. The error red is a true Van Gogh complementary, not a generic alert red |
| Type and numerals | Precise grotesk/mono. Never script. This layer is deliberately un-artistic |
| Motion | Background drifts slowly and continuously; data updates snap crisply. The contrast between a restless ground and an exact foreground **is the product's thesis** |

**One signature moment, not an even coat.** The allowance meter in the Live
Spend Feed is not a flat progress bar: it is a Starry Night current that grows
more turbulent as the agent approaches its cap, and at the cap the swirl strikes
the frame and stops dead. This single component carries the demo money-shot, the
aesthetic statement, and the product metaphor at once.

`T5.0` (design system) is P0 and runs **before** any screen. Fixing palette and
texture first means every later screen simply consumes them; the reverse order
means repainting three times.

The `frontend-design` skill is invoked at the start of W5, not during design.

---

## 5. Testing

- **Foundry** for contracts. Fuzz the daily-window rollover and the cap
  arithmetic — that is where hidden bugs live.
- **Vitest** for SDK and MCP, against a mainnet fork.
- **One mandatory test:** send a transaction through the SDK, decode it with
  `verifyTx`, assert `codes` contains the registered attribution tag. This is
  the boundary between scoring and scoring zero, so it must be automated, not
  eyeballed once.

---

## 6. Repository

pnpm monorepo, **public from the moment of registration** (rules require a
public repo at registration, not at submission; two entries were disqualified
last hackathon for repos returning 404).

```
leash/
├── contracts/    # Foundry — SpendPolicyAccount
├── sdk/          # TS — attribution, fee abstraction, policy client
├── mcp/          # MCP server
├── app/          # Next.js — 3 screens
└── examples/     # demo agent that spends, then gets blocked
```

`examples/` is not decoration: it is both the demo-video script and the thing
another team copies to onboard in five minutes.

---

## 7. Task Breakdown

Priorities are P0 (required) or **Cut** (descoped up front, so no effort is
spent holding them open).

### W0 — Unblock · 8h · blocks everything else

| ID | Task | Est | Depends |
|---|---|---|---|
| `T0.1` | Spike: read `FeeCurrencyDirectory` on-chain, send a real tx from a **zero-CELO** wallet | 2h | — |
| `T0.2` | Spike: can a contract account sign EIP-3009/ERC-1271 for x402? | 2h | — |
| `T0.3` | Spike: `toDataSuffix` → tx → `verifyTx` round-trips the tag | 1h | — |
| `T0.4` | Create ERC-8004 identity, obtain 8004scan URL | 1h | — |
| `T0.5` | Public repo + pnpm monorepo skeleton | 1h | — |
| `T0.6` | Register on celobuilders → **receive `attributionTag`** | 1h | `T0.4` `T0.5` |

`T0.2` is the fork in the road: **yes** means Path A also covers x402; **no**
(likely) makes Path B primary. Both are already designed, so this is early
knowledge, not risk.

### W1 — Contract · 20h P0 (+4h cut) · depends on `T0.1`

| ID | Task | Est | Priority |
|---|---|---|---|
| `T1.1` | `SpendPolicyAccount`: `Limit`, UTC day window, `execute()` (Path A) | 6h | P0 |
| `T1.2` | `topUpOperator()` (Path B) | 2h | P0 |
| `T1.3` | Allowlist + `pause()` + owner admin functions | 3h | P0 |
| `T1.4` | `executeWithOwnerSig` (EIP-712) | 4h | **Cut** |
| `T1.5` | Foundry tests + fuzz on day window and cap arithmetic | 6h | P0 |
| `T1.6` | Deploy to Sepolia → **mainnet**, verify on Celoscan | 3h | P0 |

### W2 — SDK · 12h · depends on `T1.6`, `T0.3`

| ID | Task | Est | Priority |
|---|---|---|---|
| `T2.1` | Attribution wrapper — every outbound tx tagged, no bypass | 3h | P0 |
| `T2.2` | Fee abstraction: select stablecoin adapter, set `feeCurrency` | 4h | P0 |
| `T2.3` | Policy client: read state + `staticcall` pre-check | 3h | P0 |
| `T2.4` | **Gate test**: `verifyTx` asserts the tag is present | 2h | P0 |

### W3 — x402 · 12h · depends on W2, `T0.2`

| ID | Task | Est | Priority |
|---|---|---|---|
| `T3.1` | x402 buyer: call a 402-gated URL and settle | 6h | P0 |
| `T3.2` | Wire into Path B — top-up bounded by daily cap | 4h | P0 |
| `T3.3` | LLM-readable structured JSON errors | 2h | P0 |

### W4 — MCP · 8h P0 (+2h cut) · depends on W3

| ID | Task | Est | Priority |
|---|---|---|---|
| `T4.1` | `leash_status` | 2h | P0 |
| `T4.2` | `leash_pay` | 3h | P0 |
| `T4.3` | `leash_fetch` | 3h | P0 |
| `T4.4` | `leash_request_approval` | 2h | **Cut** |

### W5 — Frontend · 23h P0 (+6h cut) · depends on `T1.6`

| ID | Task | Est | Priority |
|---|---|---|---|
| `T5.0` | Design system: palette, impasto filter, type scale | 4h | P0 |
| `T5.1` | Next.js + wagmi + Tailwind, mobile-first (MiniPay-compatible) | 3h | P0 |
| `T5.2` | **Live Spend Feed** + swirling allowance meter — reads event logs, no backend | 8h | P0 |
| `T5.3` | Onboard: connect → deploy account → fund | 6h | P0 |
| `T5.4` | Policy Editor (three inputs + save) | 2h | P0 |
| `T5.5` | Approval Inbox | 6h | **Cut** |

`T5.0` runs before `T5.2`. `T5.2` runs as soon as `T1.6` lands, ahead of
`T5.3`: from that moment there is always something filmable, even if everything
after it burns.

### W6 — Submission and secondary track · 17h

| ID | Task | Est | Depends |
|---|---|---|---|
| `T6.1` | `examples/` — demo agent that spends, then gets blocked | 2h | W4 |
| `T6.2` | **AskBots round 1** (≥10 reviews, establishes baseline) | 2h | W4 |
| `T6.3` | Act on round 1 review findings | 3h | `T6.2` |
| `T6.4` | **AskBots round 2** (weekend of 12–13 Sep) | 2h | `T6.3` |
| `T6.5` | Onboard the 10–50 person group on mainnet | 2h | W5 |
| `T6.6` | 90-second demo video | 4h | `T5.2` |
| `T6.7` | Tweet tagging @CeloDevs and @Celo + submit | 2h | `T6.6` |

---

## 8. Budget, Critical Path, Checkpoints

| | Hours |
|---|---|
| P0 total | **100h** |
| Available (13 days × 8h) | 104h |
| Slack | 4h |

Cut items (`T1.4`, `T4.4`, `T5.5` = 12h) are descoped from the start rather than
held open, which is what buys the Van Gogh design work.

**Critical path:**
`T0.1` → `T1.1` → `T1.5` → `T1.6` → `T2.2` → `T3.1` → `T4.2`/`T4.3` → `T6.6` → `T6.7`

Everything off this path (`T5.4`, `T6.5`) can slip without moving the submission
date.

**Checkpoints — am I behind?**

1. W0 complete within the first working day?
2. `T1.6` (contract live on mainnet) complete at ~30% of budget?
3. `T5.2` running at ~60% of budget? — past this, a submission is essentially assured.

Missing checkpoint 2 → the Cut list stays cut, no deliberation. Missing
checkpoint 3 → reduce W3 to a minimal version and pour everything into the demo.

---

## 9. Calendar Constraints

Only four things are genuinely date-bound:

- **W0 completes before any scoring transaction.** Transactions sent before the
  `attributionTag` exists are permanently uncounted.
- **AskBots round 1 must precede round 2 by enough time to act on it** — the
  score is the *delta* between rounds.
- Round 2 falls in the weekend of **12–13 Sep**.
- **Submission closes 2026-09-14 09:00 GMT (16:00 ICT, Monday).**

Organiser milestones: cPay workshop 09 Sep 13:00 GMT · mid-point leaderboard
snapshot and first farming scan 11 Sep 09:00 GMT · results 25 Sep.

---

## 10. Submission Requirements

Required at registration: `projectName`, public `githubUrl`, personal
`telegram`, `primaryTrack`, `erc8004Url`, `agentWalletAddress`. Tick
`cpayBetaOptIn`.

Required to publish: the above plus a real X/Twitter post tagging **@CeloDevs**
and **@Celo** (the link goes in `socialLink` — never a placeholder), demo video,
contract addresses, `celoNetwork`, and `agentContributionNotes`. A published
submission remains editable until the deadline.

**Demo video (90s) — this decides `judges-favorite`.** Not a feature tour:

> Agent spends normally → allowance meter climbs → agent attempts an over-limit
> spend → screen turns vermilion, **transaction actually reverts on Celoscan** →
> open the agent's wallet: **zero CELO**, gas paid in stablecoin.

The final beat is where the primitive scores — fee abstraction is named by the
organisers as under-used and is what they want to see.

---

## 11. Compliance Notes (hackathon rules)

- **Celo mainnet only.** Testnet references in the repo are fine; testnet
  activity counts for nothing.
- **Public repo at registration**, still resolving at judging.
- **Independent parties only.** Counterparties must not be our wallets, must not
  be first-funded by us or our dominant funder, and must have Celo activity from
  before 2026-08-28. The distribution plan (other hackathon teams) satisfies
  this by construction. **No self-funded wallets, under any framing.**
- **Sponsored gas is not builder contribution**; fees we pay ourselves are —
  which is exactly what fee abstraction gives us.
- **Code is written during the hackathon**; commit history is examined.

---

## 12. Out of Scope

Self / proof-of-personhood (evaluated and dropped: in this threat model the
owner is already authenticated by key, so Self would be decoration, and the
judges audit for exactly that) · multi-chain · ERC-4337 · session keys ·
analytics dashboard · history export · team management · `cpay-feedback` track.
