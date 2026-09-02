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

**PLAN 1 COMPLETE — all 15 tasks done, Definition of Done verified 2026-09-02.**

Task 5 closed 2026-09-02: attribution tag `celo_3dec652cd977`, operator EOA
`0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6` registered as `agentWalletAddress`,
ERC-8004 agentId 9804. See `docs/registration.md`.

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


Task 3 and T0.1 both closed 2026-09-02. The operator EOA holds **exactly zero
CELO** and 2.55 USDC, and has sent tagged mainnet transactions paying gas in
USDC — the demo's closing beat now exists on chain
(`0x1d10d9cb…6595`). Owner holds 3.947 CELO.

**Watch out:** forno rejects fee-currency sends non-deterministically. Anything
that sends with `feeCurrency` must retry; see T0.1 in `spikes/README.md`.

## Live on mainnet

| | |
|---|---|
| SpendPolicyAccount | `0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` (verified) |
| Owner | `0x2B33cb68…4f57` — 3.77 CELO |
| Operator | `0xd44daF6D…50D6` — **0 CELO**, 1.05 USDC |
| Attribution tag | `celo_3dec652cd977` |
| Policy | USDC perTx 0.50 / daily 1.00; contract holds 1.50 |
| Proof spend | `0x3fb0324f…1f70` |

## The ERC-1271 decision: RESOLVED — skipped

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

**Decided 2026-09-02: skipped.** x402 goes via Path B. The demo's decisive beat
— a zero-CELO agent wallet paying gas in a stablecoin — is already proven on
chain, and Path B keeps the core claim intact. Revisiting this means a new
deployment, since the contract is not upgradeable.

## Environment

`.env` exists and is filled in (owner, operator, attribution tag, celobuilders
key). It is gitignored. Per the human partner's explicit
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
written. Plan 2 was blocked on the ERC-1271 decision; that decision is made, so
it can be written now against Path B.

**Watch out:** forno rejects fee-currency sends non-deterministically. Anything
that sends with `feeCurrency` must retry with the nonce re-read between
attempts — this bit twice in one run. See T0.1 in `spikes/README.md`.
