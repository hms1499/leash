# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Leash gives an AI agent a wallet without trusting it. Funds sit in `SpendPolicyAccount`
on Celo mainnet; the agent (an "operator") can only ask the contract to spend, and the
contract reverts past its per-transaction cap, daily cap, and optional payee allowlist.

**The contract is not upgradeable.** Any change to `contracts/src/SpendPolicyAccount.sol`
means a fresh deployment and a new address everywhere.

Start by reading `docs/RESUME.md`. It carries live mainnet state, what is deployed, and
what has been proven on-chain rather than asserted.

## Commands

pnpm workspace (`sdk`, `mcp`, `app`, `examples`, `spikes`), pnpm 9.12.0, Node 20.
Contracts are Foundry and are not part of the workspace.

```bash
pnpm -F @leash/sdk test          # 42 tests
pnpm -F @leash/mcp test          # 12
pnpm -F @leash/app test          # 134 (vitest)
pnpm -F @leash/app test:e2e      # 6 (playwright; builds and serves unless LEASH_E2E_URL is set)
cd contracts && forge test       # 32
```

Typecheck with `npx tsc --noEmit` inside `sdk`, `mcp`, `spikes`, `app`, `examples`.
There is no ESLint, Prettier, or Biome config. Match the style of surrounding code.

**`test:gate` in `sdk` and `mcp` spends real money on mainnet.** Those files are excluded
from the ordinary `test` script on purpose. Never run them to "check something works".

## A fresh clone must do two things

1. `git config core.hooksPath .githooks` — the pre-commit secret guard is local git
   config and is not cloned.
2. Copy `.env.example` to `.env` and fill it in. It holds **plaintext private keys** by
   the maintainer's explicit choice, and the repo is public.

Only `sdk/vitest.config.ts` loads the root `.env` automatically. Scripts and the other
packages do not: source it first with `set -a; source .env; set +a`.

## Chain facts that have already cost this project money

- **Celo produces one block per second, not one per five.** A block count is a second
  count. An earlier ~5s figure in the spec made the feed scan 14.4 hours while claiming
  three days.
- **forno refuses a `getLogs` range wider than 5,000 blocks.** Any history window costs
  (window ÷ 5,000) sequential round trips.
- **Always send an explicit `gas`.** A gas estimate is a reserve, not a price, and with
  no limit set the reserve is the *block* gas limit — measured at 0.465 USDC against
  0.0022 actually spent. See `GAS_LIMIT` in `sdk/src/policyClient.ts`.
- **Always pass an explicit `chainId` on every wagmi write.** `writeContract` and
  `deployContract` do not check which chain they are signing on.
- **Wait on the condition, not the receipt.** forno is load-balanced and serves stale
  reads after a confirmed transaction. Use `pollUntil` in `app/lib/confirm.ts`.
- **forno rejects fee-currency sends non-deterministically.** Retry, re-reading the nonce
  between attempts.
- **x402 has no refunds.** A `5xx` can mean the payment settled. Read the chain before
  retrying; never retry on a guess.
- **A draw sized to the bare shortfall cannot pay** — it spends its own gas out of the
  balance it just topped up.

## Never report a write as confirmed unless it was observed

Every write path polls the chain for the value it expects and says something different
when the poll times out ("Sent, but the chain has not confirmed it yet"). A receipt is
not confirmation, and a resolved promise is not a landed transaction — `waitForTransactionReceipt`
resolves on revert, so check `receipt.status`. Two implementations of one operation must
not behave differently; if you fix an error path in one, fix its sibling.

Attacker-controllable input is never trusted for anything that gates a UI affordance. A
`?operator=` query parameter is only a candidate; `operators()` on the account is what
decides.

## Generated and superseded

- `app/lib/contract.ts` holds the ABI and bytecode copied out of `contracts/out` by
  `forge build`. Regenerate after any contract change — stale bytecode deploys the old
  contract.
- `0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` is a superseded deployment. Do not use it
  or add it to fixtures.

## Conventions

- Money on screen uses the `.num` class (mono, `tabular-nums`) so digits do not reflow as
  values update live.
- Comments explain *why*, especially where a line guards a hazard that was paid for. Match
  that density; do not strip those comments when editing nearby code.
- Commit subjects describe the defect or the change in plain English, not the diff:
  `fix(app): one failed read reported a landed transaction as never sent`. Bodies explain
  the reasoning and cite evidence.

## Committing

`scripts/check-secrets.sh` runs pre-commit and blocks keys and mnemonics. It allows a
64-hex value only when labelled as a transaction hash **within 10 characters** — write
`tx: 0x…` or an explorer URL, not `Top-up tx (some clause): 0x…`.

Never commit `.env`, and never commit or log a poll URL from an x402 purchase: it is a
bearer capability.
