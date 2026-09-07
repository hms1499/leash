<div align="center">

# Leash

**Give an AI agent a wallet without trusting it.**

Spend limits and payee allowlists enforced on-chain — not by a prompt.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Network: Celo Mainnet](https://img.shields.io/badge/Network-Celo%20Mainnet-fcff52.svg)](https://celoscan.io/)
[![Contract: verified](https://img.shields.io/badge/Contract-source--verified-brightgreen.svg)](https://celoscan.io/address/0x7ada926b021baef4896f51f237bca61435e43fd2#code)
[![Not upgradeable](https://img.shields.io/badge/Proxy-none-blue.svg)](contracts/src/SpendPolicyAccount.sol)

[Live app](https://leash-app-phi.vercel.app) ·
[Live account](https://leash-app-phi.vercel.app/a/0x7aDa926B021BAef4896F51F237bCA61435E43fd2) ·
[Contract](https://celoscan.io/address/0x7ada926b021baef4896f51f237bca61435e43fd2) ·
[Agent setup](docs/mcp-setup.md) ·
[Deployments & proofs](docs/deployments.md)

</div>

---

## The problem

Every "agent wallet" today is a private key in an agent's environment and a
sentence in a system prompt asking it to be careful. That is not a limit. It is
a request — one that a prompt injection, a bad tool result, or an ordinary
hallucination can talk its way past, and one that offers nothing at all once the
key leaks.

**Leash replaces the request with a revert.**

The money never sits in the agent's wallet. It sits in a contract the agent does
not own. The agent can only *ask* that contract to spend, and the contract
refuses past its per-transaction cap, its daily cap, and its optional payee
allowlist. A leaked agent key does not become an unbounded one — it becomes a
key that can spend at most one day's allowance, only to addresses you named.

The limits are bytecode on Celo mainnet. They are not upgradeable, and they are
not ours to change on your behalf.

---

## How it works

```mermaid
flowchart LR
    Owner["👤 Owner<br/><i>your wallet</i>"]
    Agent["🤖 Agent<br/><i>operator key</i>"]
    Account["📜 SpendPolicyAccount<br/><i>holds the funds</i>"]
    Payee["🏦 Payee / x402 API"]

    Owner -->|"setPolicy · setOperator<br/>setPaused · sweep"| Account
    Agent -->|"execute() — asks"| Account
    Account -->|"transfer() — if allowed"| Payee
    Account -.->|"revert: cap exceeded"| Agent

    style Account fill:#fcff52,stroke:#000,color:#000
    style Agent fill:#e8e8e8,stroke:#666,color:#000
    style Owner fill:#e8e8e8,stroke:#666,color:#000
```

Every spend passes four gates, in this order, inside a single transaction:

| # | Gate | Reverts with |
|---|------|--------------|
| 1 | Is the caller a registered operator? | `NotOperator` |
| 2 | Is the account unpaused? | `ContractPaused` |
| 3 | Is the payee allowed (when the allowlist is on)? | `PayeeNotAllowed` |
| 4 | Is the amount within the per-tx **and** daily cap? | `PerTxCapExceeded` · `DailyCapExceeded` |

The daily counter is on-chain state keyed to `block.timestamp / 1 days`, so it
resets at 00:00 UTC and cannot be reset by the agent, by us, or by a redeploy of
the frontend.

**Checking a limit is free.** The SDK runs every spend through `preCheck`, a
`staticcall`, before signing anything. An agent that would exceed its cap learns
so without sending a transaction, paying gas, or leaving a failed hash behind.

---

## What is proven on Celo mainnet

Every row is a transaction you can open. Nothing here is a testnet rehearsal,
and nothing is a claim about what the code *would* do.

| What it proves | Evidence |
|---|---|
| **The policy gates a real spend.** `remainingToday` fell by exactly the amount spent, so the cap governed the transfer rather than merely coexisting with it. | tx: [`0x3fb0324f…a851f70`](https://celoscan.io/tx/0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70) |
| **An agent wallet holding zero CELO still transacts,** paying gas in USDC through Celo's fee abstraction. The operator's CELO balance is `0` before and after every spend below. | [operator `0xd44daF6D…c850D6`](https://celoscan.io/address/0xd44daf6db6c8057c206e6acc27e6384b8ec850d6) |
| **The attribution tag round-trips.** The ERC-8021 suffix decodes to `["celo_3dec652cd977"]` off-chain and again straight from raw chain data. | same tx as above |
| **x402 paid with money drawn through the policy.** The agent rented a Google Cloud VM and the daily counter fell by exactly the draw — the caps apply to agent purchases, not only to plain transfers. | draw tx: [`0xec08a200…6f2f33db`](https://celoscan.io/tx/0xec08a20020983992d18d6faa7cccd91e0bba0f2432e6f22e534616b96f2f33db) · settlement tx: [`0xb5dd4d16…f7f2a91e25`](https://celoscan.io/tx/0xb5dd4d16a7e65453ddcdc70b235384a7bc20c8845a8ce5096084c7f7f2a91e25) |
| **A real MCP agent spent through the policy.** `leash_pay` called by a Claude session with no human typing an amount or a payee. The allowance fell one step; the `Spent` event carries the operator. | tx: [`0x218d7f95…a244396`](https://celoscan.io/tx/0x218d7f9516481a3c5747226cf2f90e73beaa4fde86e68c363e9259a66a244396) |
| **The contract is deployed and source-verified.** 3406 bytes, solc 0.8.24, not a proxy and not upgradeable. The owner can set policy, pause and sweep, and is deliberately *not* an operator — it cannot spend through the agent's paths. | deploy tx: [`0x8a6f4d8c…0a2fc779`](https://celoscan.io/tx/0x8a6f4d8cfd9d49d22f3948af384f87ba169533d903e12885aa3296bc0a2fc779) |

[`docs/deployments.md`](docs/deployments.md) has the full working: every value
read back off the chain rather than taken from a test's own output, what each
step cost, and an honest record of the run that hit a gateway `500` and how the
chain settled whether the money had actually moved.

---

## Quick start

### Look at it — no wallet required

The dashboard reads Celo mainnet directly. Policy limits, remaining allowance,
balances and the live activity feed all render for a stranger with an empty
browser.

**<https://leash-app-phi.vercel.app/a/0x7aDa926B021BAef4896F51F237bCA61435E43fd2>**

That is a live account and the numbers on it are real.

### Give your own agent a wallet

**In the browser (recommended).** A six-step wizard connects your wallet,
deploys *your own* `SpendPolicyAccount`, registers your agent, sets the limits,
funds it, and hands you a filled-in `.mcp.json`. You paste your agent's address
once; it assembles every contract call for you.

```bash
pnpm install
pnpm --filter @leash/app dev     # then open http://localhost:3000/setup
```

Put `CELOSCAN_KEY` in `app/.env.local` (and in the app's server-side deployment
environment) to enable automatic discovery of every compatible policy account
deployed directly by the connected owner. The key stays in the Next.js API
route; it is never shipped to the browser. Manual import remains available
when the explorer is unavailable or a relayer created the account.

**From the command line.** [`docs/mcp-setup.md`](docs/mcp-setup.md) does the
same thing with `forge create` and `cast send`, explains every value it asks
for, and assumes no knowledge of this repository.

> [!IMPORTANT]
> Deploy your own account. Do not point `LEASH_ACCOUNT` at this project's
> contract — that account's owner key is ours. We could sweep your funds, and
> you could not set your own policy.

### Watch it spend, then get blocked

`examples/demo-agent.ts` makes three policy-checked spends on mainnet and is
then refused a fourth for exceeding the per-transaction cap — refused by the
contract, in a `staticcall`, so nothing is signed and no gas is spent. There is
deliberately no LLM in the loop, so it reruns identically every time.

```bash
LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm --filter @leash/examples demo
```

> [!WARNING]
> This moves **real USDC on Celo mainnet** (~0.03 USDC plus gas per run), which
> is why it refuses to start without the explicit environment gate.
> [`examples/README.md`](examples/README.md) has the full cost breakdown.

---

## What your agent gets

An MCP server exposing three tools to any MCP-capable agent (Claude Code, Claude
Desktop, or your own client):

| Tool | What it does |
|---|---|
| `leash_status` | Remaining daily allowance, caps, balances, and when the allowance resets. Meant to be called *before* spending. |
| `leash_pay` | Pay a Celo address from the agent wallet. Every refusal returns only the figures its own revert supplied, names who can clear it, and says plainly whether waiting will help. |
| `leash_fetch` | Call an x402-gated HTTP resource, paying per request. Funds are drawn through the policy first, so a purchase the policy refuses never happens. `quote_only` prices it for free. |

The x402 path is the one worth reading twice. The order is
**quote → check the caller's ceiling → draw through the contract → sign once** —
and step three is a `revert`, not a guideline. Gas for the draw is deliberately
included *inside* the drawn amount, so it counts against the daily cap like any
other spend rather than being a free channel around it.

---

## Repository layout

| Path | What it is |
|---|---|
| `contracts/` | Foundry. `SpendPolicyAccount` — the on-chain policy engine. **Not upgradeable**: any change means a fresh deployment and a new address. |
| `sdk/` | TypeScript client. `LeashClient`, free pre-flight checks, stablecoin gas, ERC-8021 attribution, and a full x402 client. |
| `mcp/` | MCP server. The three tools above, over stdio. |
| `app/` | Next.js dashboard and onboarding wizard. Reads mainnet directly; a wallet is needed only to write. |
| `examples/` | The demo agent — also the thing another team copies to adopt Leash. |
| `spikes/` | Throwaway scripts that verified every chain-level assumption, with the evidence kept. |
| `docs/` | Design spec, deployment record, agent setup guide, and the design system. |

---

## The Celo primitives it leans on

- **Fee abstraction (CIP-64).** The agent pays gas in USDC via `feeCurrency`, so
  an agent operator never needs a CELO balance. This is also where the project's
  most expensive lesson lives: a `feeCurrency` transaction sent with no gas limit
  reserves the *block* gas limit — measured at 0.465 USDC against 0.0022 actually
  spent — which made the top-up path unreachable until `LeashClient` began
  sending an explicit limit.
- **ERC-8021 attribution.** Every transaction carries the attribution tag in its
  data suffix, verified by decoding it back out of raw chain data rather than out
  of the code that wrote it.
- **ERC-8004 identity.** The operator owns agentId
  [9804](https://8004scan.io/agents/celo/9804) in the on-chain agent registry.
- **x402.** The agent buys a real metered resource, and the money it spends is
  drawn through the same policy that governs everything else.

---

## Security model

### What Leash guarantees

- **The agent never holds the balance.** It holds an allowance, denominated by a
  contract it cannot modify.
- **A leaked operator key is bounded.** Worst case is one day's cap, to allowed
  payees, until the owner pauses the account.
- **The owner is not an operator.** It sets policy, pauses, and sweeps. It cannot
  spend through the agent's paths, so the two roles cannot be confused.
- **The kill switch is on-chain.** `setPaused` stops `execute` and
  `topUpOperator` in the same block it lands, with no cooperation from the agent.
- **Nothing reports success it did not observe.** Every write path polls the
  chain for the value it expects, because a receipt proves a transaction landed —
  never that the next load-balanced node has seen that block.

### What it does not

Stated plainly, because a security tool that oversells itself is worse than none:

- **Ownership cannot be transferred.** `owner` is `immutable` and there is no
  transfer function. Lose the owner key and the funds are unreachable, since
  `sweep` is owner-only. **Use a multisig (e.g. Safe) as the owner.**
- **The allowlist does not cover `topUpOperator`.** An agent configured for x402
  can draw funds to its own wallet within the caps and then pay anyone. The caps
  always apply; the allowlist is a full constraint only when that path is unused.
- **Caps are policy accounting, not solvency.** They limit what may be spent, not
  what is there. The dashboard shows both for exactly this reason.
- **Non-standard ERC-20s are out of scope.** `execute` requires `transfer` to
  return `true`; fee-on-transfer and rebasing tokens would also break the
  accounting. Configure ordinary tokens (USDC is what this is built and proven
  against).
- **The contract is unaudited.** It is 153 lines, deliberately small, and covered
  by 32 Foundry tests — but it has not been through a professional audit.

### Key handling

This repository stores `OWNER_PK` and `OPERATOR_PK` as **plaintext** in `.env`
rather than in an encrypted keystore. That was a deliberate hackathon trade-off,
not an oversight — but anyone who reads that file (a backup, shell history, a
screen share) gets the raw key, this repo is public, and a leaked key on mainnet
is drained within seconds. Treat `.env` as being exactly as sensitive as the
funds it can move.

`scripts/check-secrets.sh` runs pre-commit and blocks `.env` files, private-key
shapes, and mnemonics. It is a regex safety net, not a security boundary: it will
not catch a secret split across lines, encoded into another format, or committed
with `--no-verify`. Review your own diffs.

---

## Development

Requires **Node >= 20**, **pnpm 9.12.0** (pinned in the root `package.json`), and
[Foundry](https://book.getfoundry.sh/) for the contracts. The pnpm workspace is
`sdk`, `mcp`, `app`, `examples`, `spikes`; contracts are Foundry and stand
outside it.

```bash
git clone https://github.com/hms1499/leash && cd leash
git config core.hooksPath .githooks   # required: hooks are not cloned
cp .env.example .env                  # then fill it in
pnpm install
```

| Command | Suite |
|---|---|
| `cd contracts && forge test` | 32 contract tests |
| `pnpm -F @leash/sdk test` | 66 SDK tests |
| `pnpm -F leash-agentpay test` | 27 MCP tests |
| `pnpm -F @leash/app test` | 200 app tests (vitest) |
| `pnpm -F @leash/app test:e2e` | 8 end-to-end tests (playwright) |
| `npx tsc --noEmit` | run inside `sdk`, `mcp`, `app`, `examples`, `spikes` |

> [!CAUTION]
> `test:gate` in `sdk` and `mcp` spends **real money on mainnet**. Those files
> are excluded from the ordinary `test` script on purpose. Never run them to
> "check that something works".

There is no ESLint, Prettier, or Biome config — match the style of the code
around you. `app/lib/contract.ts` holds the ABI and bytecode copied out of
`contracts/out`; regenerate it after any contract change, or the wizard deploys
the old contract.

---

## Project status

Built for the Celo **Agents at Work** hackathon. Live on mainnet, with every
claim above backed by a transaction rather than a test's own output.

**The MCP server is published.** `leash-agentpay` is on npm, and the
`.mcp.json` block runs it with `npx -y leash-agentpay` — nobody needs to clone
this repo or edit a local path to use it. `@leash/sdk` stays unpublished by
choice: it has one consumer, and publishing it would commit this project to a
public API and a semver contract nobody has asked for, so it is bundled into
the server instead.

Every suite above runs on GitHub Actions now, on push to `main` and on every
pull request: the contracts under Foundry, the pnpm suites with typechecking
across all five packages, and a job that packs the tarball, installs it into a
temp directory and starts the bin. That last job is the one that earns its
keep — it is the only place a bundle that failed to inline `@leash/sdk` would
be caught, because every other suite resolves that import through the workspace
symlink and passes either way.

Also known and deliberately deferred: an ownership transfer path in a future
non-upgradeable v2, an owner switch to disable `topUpOperator`, and a factory
contract so account addresses are deterministic and the frontend never carries
bytecode.

---

## License

MIT — see [LICENSE](LICENSE).
