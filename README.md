# Leash

Give an AI agent a wallet without trusting it. Spend limits and payee
allowlists are enforced on-chain, not by a prompt.

The money never sits in the agent's wallet. The agent can only *ask* the
contract to spend, and the contract reverts past its per-transaction cap, its
daily cap, and its optional payee allowlist. A leaked agent key does not become
an unbounded one — it becomes a key that can spend at most one day's allowance
to addresses you named.

Built for the Celo **Agents at Work** hackathon. Live on Celo mainnet at
[`0x7aDa926B…E43fd2`](https://celoscan.io/address/0x7ada926b021baef4896f51f237bca61435e43fd2),
source-verified, and not upgradeable.

## What is proven on mainnet

Every row is a transaction you can open. Nothing here is a testnet rehearsal
and nothing is a claim about what the code would do.

| What it proves | Evidence |
|---|---|
| **The policy gates a real spend.** `remainingToday` fell by exactly the amount spent, so the cap governed the transfer rather than merely coexisting with it. | tx: [`0x3fb0324f…a851f70`](https://celoscan.io/tx/0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70) |
| **An agent wallet holding zero CELO still transacts,** paying gas in USDC through Celo's fee abstraction. The operator's CELO balance is `0` before and after every spend below. | [operator `0xd44daF6D…c850D6`](https://celoscan.io/address/0xd44daf6db6c8057c206e6acc27e6384b8ec850d6) |
| **The attribution tag round-trips.** The ERC-8021 suffix decodes to `["celo_3dec652cd977"]` off-chain and again straight from raw chain data. | same tx as above |
| **x402 paid with money drawn through the policy.** The agent rented a Google Cloud VM and the daily counter fell by exactly the draw — the caps apply to agent purchases, not only to plain transfers. | draw tx: [`0xec08a200…6f2f33db`](https://celoscan.io/tx/0xec08a20020983992d18d6faa7cccd91e0bba0f2432e6f22e534616b96f2f33db) · settlement tx: [`0xb5dd4d16…f7f2a91e25`](https://celoscan.io/tx/0xb5dd4d16a7e65453ddcdc70b235384a7bc20c8845a8ce5096084c7f7f2a91e25) |
| **The contract is deployed and source-verified.** 3406 bytes, solc 0.8.24, not a proxy and not upgradeable. The owner can set policy, pause and sweep, and is deliberately *not* an operator — it cannot spend through the agent's paths. | deploy tx: [`0x8a6f4d8c…0a2fc779`](https://celoscan.io/tx/0x8a6f4d8cfd9d49d22f3948af384f87ba169533d903e12885aa3296bc0a2fc779) |

`docs/deployments.md` has the full working, including every value read back off
the chain rather than taken from a test's own output, and an honest record of
the run that hit a gateway `500` and how the chain settled whether the money had
moved.

## The Celo primitives it leans on

- **Fee abstraction (CIP-64).** The agent pays gas in USDC via `feeCurrency`, so
  an agent operator never needs a CELO balance to top up. This is also where the
  project's most expensive lesson lives: a `feeCurrency` transaction sent with no
  gas limit reserves the *block* gas limit — measured at 0.465 USDC against
  0.0022 actually spent — which made the top-up path unreachable until
  `LeashClient` began sending an explicit limit.
- **ERC-8021 attribution.** Every transaction carries the hackathon attribution
  tag in its data suffix, verified by decoding it back out of raw chain data.
- **ERC-8004 identity.** The operator owns agentId
  [9804](https://8004scan.io/agents/celo/9804) in the on-chain agent registry.
- **x402.** The agent buys a real metered resource, and the money it spends is
  drawn through the same policy that governs everything else.

## Try it

The dashboard reads Celo mainnet directly and needs no wallet to look — the
policy limits, remaining allowance, and activity feed for any account render for
a stranger with an empty browser.

```bash
pnpm --filter @leash/app dev
```

Then open `/a/0x7aDa926B021BAef4896F51F237bCA61435E43fd2` — that is the live
account on Celo mainnet, and the numbers you see are real.

A hosted URL will be added here once the app is deployed.

## See it spend, and get blocked

`examples/demo-agent.ts` is an agent that makes three policy-checked spends on
Celo mainnet and is then refused a fourth for exceeding the per-transaction cap
— refused by the contract, in a staticcall, so nothing is signed and no gas is
spent. It is both the demo script and the thing another team copies to adopt
Leash. It moves **real money**, so it refuses to run without an explicit gate:

```bash
LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm --filter @leash/examples demo
```

`examples/README.md` has the cost breakdown and prerequisites.

## Use Leash with your agent

Two routes to the same place — your own account, and a `.mcp.json` block your
agent reads.

**In the browser (easier).** Run the app and open `/`. The onboarding wizard
connects your wallet, deploys your own `SpendPolicyAccount`, adds your agent,
sets the limits, and ends by handing you the filled-in `.mcp.json`. You paste
your agent's wallet address once; it assembles every contract call for you.

```bash
pnpm --filter @leash/app dev
```

**From the command line.** `docs/mcp-setup.md` does the same thing with
`forge create` and `cast send`, and explains every value it asks for. It assumes
no knowledge of this repository.

## Packages

- `contracts/` — Foundry. `SpendPolicyAccount`, the on-chain policy engine.
- `sdk/` — TypeScript client. Attribution tagging, stablecoin gas, policy reads.
- `mcp/` — MCP server so any agent can spend through the leash.
- `app/` — Next.js UI.
- `spikes/` — throwaway scripts that verify chain-level assumptions.

## Setup

1. Copy `.env.example` to `.env` and fill in the real values. `.env` is
   gitignored — never commit it.
2. Enable the commit-time secret guard: `git config core.hooksPath .githooks`.
   This is a local git setting, not tracked by git itself, so **every fresh
   clone must run this command again** — hooks are not cloned along with the
   repository.
3. `pnpm install` from the repo root loads `dotenv`, which the SDK test
   runner (`sdk/vitest.config.ts`) uses to read the repo-root `.env` so
   credential-gated tests (e.g. the mainnet attribution gate test) can see
   their variables instead of silently skipping.

**On secrets:** this project stores `OWNER_PK` and `OPERATOR_PK` as plaintext
in `.env` rather than in an encrypted Foundry keystore. That was a deliberate
choice for simplicity during the hackathon, not an oversight — but it means
anyone who reads your `.env` file (or a misconfigured backup, shell history,
or screen share) gets the raw key, and this repo is public, so a leaked key
is realistically drained within seconds. Treat `.env` as sensitive as the
funds it can move.

The pre-commit guard (`scripts/check-secrets.sh`) catches `.env` files and
common key/mnemonic shapes, but it is a regex safety net, not a guarantee —
it will not catch a secret split across lines, encoded/embedded in another
format, or committed with `--no-verify`. It also deliberately lets through a
64-hex value that is itself immediately labelled as a transaction hash (a
`tx:`/`hash:` prefix or an explorer `.../tx/` URL), since this project must
record real proof-tx hashes in its own docs and those are indistinguishable
from a key by shape alone. Review diffs yourself before committing anything
sensitive-looking.

## Design

See `docs/superpowers/specs/2026-09-01-leash-design.md`.
