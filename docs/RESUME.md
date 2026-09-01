# Resume Here — Leash

Session paused 2026-09-01. This file is the entry point for the next session.
Read it before anything else, then read the two documents it points at.

## What this project is

Leash gives an AI agent a wallet without trusting it: spend limits and payee
allowlists are enforced on-chain, not by a prompt. Built for the Celo
"Agents at Work" hackathon.

- **Primary track:** `judges-favorite` · **Secondary:** `askbots-growth`
- **Deadline:** 2026-09-14 09:00 GMT (16:00 ICT, Monday)
- **Repo:** https://github.com/hms1499/leash (public)

## Read these, in order

1. `docs/superpowers/specs/2026-09-01-leash-design.md` — the design. Binding authority.
2. `docs/superpowers/plans/2026-09-01-leash-foundation.md` — Plan 1 of 3, the plan being executed.
3. `.superpowers/sdd/2026-09-01-leash-foundation/progress.md` — the SDD ledger:
   every task's outcome, every finding, every ruling made on the human partner's
   behalf. **This file is gitignored and lives only on this machine.** It is the
   recovery map; `git clean -fdx` would destroy it.

## State

**Done and reviewed: Tasks 1, 2, 4, 6, 7, 8, 9, 11, 12, 13, 15.**

| Suite | Status |
|---|---|
| `cd contracts && forge test` | 26/26 |
| `cd sdk && pnpm exec vitest run` | 11/11 |
| `cd sdk && pnpm exec tsc --noEmit` | exit 0 |

Built: `SpendPolicyAccount.sol` (ownership, pause, per-token caps on a UTC-day
window, Path A `execute()` with allowlist, Path B `topUpOperator()`), the
`@leash/sdk` package (attribution tagging, fee-currency selection, policy client
with LLM-readable errors), two resolved architecture spikes, and a pre-commit
secret guard.

**Not started: Tasks 3, 5, 10, 14.** All four are blocked on things only the
human partner can supply. None is blocked on code.

## What is blocked, and on what

| Task | Needs |
|---|---|
| **5** Register with celobuilders | operator EOA address · ERC-8004 identity URL · personal Telegram handle |
| **3** First tagged mainnet tx | the `attributionTag` that Task 5 returns |
| **10** Deploy to mainnet | owner EOA + ~1-2 CELO · Celoscan API key · **and the ERC-1271 decision below** |
| **14** Attribution gate test | everything above |

Attribution is **not retroactive**: transactions sent before the tag exists are
permanently uncounted. Task 5 is the cheapest unblock and the most valuable.

## The open decision: ERC-1271 pre-authorization

Spike T0.2 proved a contract CAN pay x402 directly — Celo USDC and USDT both
route `transferWithAuthorization` through `SignatureChecker.isValidSignatureNow`,
which falls back to ERC-1271 for contract payers. Evidence is in
`spikes/README.md` and was independently reproduced in review.

But a naive `isValidSignature` is a **total policy bypass**: it receives only a
`bytes32` hash, cannot recover `(to, value)`, and so cannot enforce any cap. An
operator could drain the account via x402 without ever entering `_consume()`.

The only safe shape is pre-authorization: the operator first calls
`authorizeX402Payment(to, value, validAfter, validBefore, nonce)`, which runs
`_consume()` and stores the resulting EIP-712 digest; `isValidSignature` then
only looks that digest up and burns it.

| | Build it | Skip it |
|---|---|---|
| Cost | 6-8h against ~4h remaining slack | 0 |
| x402 route | Path A — every spend policed | Path B — daily cap only, funds leave contract control |
| Demo claim | "even x402 is capped" | "the agent can only ever reach $X/day" |

**This must be decided BEFORE Task 10 broadcasts.** Adding ERC-1271 after
deployment means abandoning the deployed address and redeploying.

## Environment

Copy `.env.example` to `.env` and fill it in. Per the human partner's explicit
choice, private keys live in `.env` in plaintext rather than an encrypted
keystore — the tradeoff is documented in the README.

A pre-commit guard (`scripts/check-secrets.sh`, wired via
`git config core.hooksPath .githooks`) blocks committed keys and mnemonics. Its
header lists what it does NOT catch. `core.hooksPath` is local config and is not
cloned — a fresh clone must set it again.

## How this plan is being executed

Via the `superpowers:subagent-driven-development` skill: one fresh implementer
subagent per task, a task review after each, a fix loop capped at five rounds,
then a whole-branch review at the end. To resume, re-invoke that skill with the
plan path; it reads the ledger, skips tasks already marked complete, and
continues at the first one without a completion line.

Plans 2 (x402 + MCP server) and 3 (frontend, Van Gogh design system) are not yet
written. Plan 2 was deliberately deferred until the ERC-1271 decision is made,
because that decision determines its architecture.
