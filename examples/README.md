# Leash demo — an agent that spends, then gets blocked

`demo-agent.ts` is both the demo script that gets filmed and the thing
another team copies to adopt Leash. It is deliberately not an LLM: there is
no model in the loop, so it can be rerun exactly the same way every time.

## What it proves

1. An agent wallet (an operator EOA with a `LeashClient`) can send three
   small, policy-checked spends against a deployed `SpendPolicyAccount`
   contract on Celo mainnet, each landing as a real transaction, each paying
   gas in a stablecoin rather than CELO.
2. After each spend, `remainingToday` falls — the on-chain daily allowance is
   real state, not a UI number.
3. A fourth request, for an amount above the contract's per-transaction cap,
   is refused — by the contract, via `preCheck`, which is a `staticcall`.
   Nothing is signed and no transaction is sent for the refusal: it costs no
   gas and leaves no hash. That is the point of the demo — the agent cannot
   talk its way past the limit, and checking the limit is free.

## Cost

Running it to completion moves **real USDC on Celo mainnet**: three spends
of 0.01 USDC each (0.03 USDC) plus gas for those three transactions (each
paid in USDC, on the order of a few thousandths of a dollar per send — see
`sdk/src/policyClient.ts`'s note on `GAS_LIMIT`). The refused fourth request
costs nothing. Total: **roughly 0.03 USDC plus a few cents of gas at most**,
assuming the operator wallet is already funded.

## The real-money gate

The script refuses to run unless `LEASH_DEMO_SPEND_REAL_MONEY=yes` is set in
the environment:

```
LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm -F @leash/examples demo
```

Without that variable it prints a warning to stderr and exits non-zero
without touching the network. This is the most important line in the
script — read it before you set the variable. Do not set it unless you
intend to spend real money from the wallet named by `LEASH_ACCOUNT` below.

## Environment variables

All of these are required except `CELO_RPC_URL`. See `.env.example` at the
repo root for concrete values already used elsewhere in this project.

| Variable | Meaning |
|---|---|
| `OPERATOR_PK` | Private key of the agent's operator EOA. Holds zero CELO by design; pays gas in a stablecoin via a fee-currency adapter. |
| `LEASH_ACCOUNT` | Address of the deployed `SpendPolicyAccount` contract that holds the funds and enforces the policy. |
| `ATTRIBUTION_TAG` | This project's registered attribution tag, format `celo_` + 12 hex characters. |
| `SPEND_TOKEN` | ERC-20 token the demo spends (Celo-native USDC). |
| `SPEND_PAYEE` | Address the demo pays. Must be allowed by the account's payee policy, if one is configured. |
| `FEE_ADAPTER` | Whitelisted fee-currency adapter address used to pay gas in a stablecoin, e.g. the USDC adapter from `KNOWN_FEE_ADAPTERS` in `@leash/sdk`. |
| `CELO_RPC_URL` | Optional. Celo mainnet RPC endpoint; falls back to the SDK's default when unset. |

Never put a private key in a file this repo tracks. Keep it in `.env`
(gitignored) or another out-of-band secret store, and source it into the
shell before running the demo.

## What it prints

- The account address and the agent (operator) address.
- Up to three lines like `spend 1: 0.01 USDC  https://celoscan.io/tx/<hash>`,
  each followed by the remaining daily allowance after that spend.
- If any of the first three spends is itself refused (for example, because
  the daily allowance was already partly spent by an earlier run today), the
  loop stops early and says so instead of pretending the spend happened.
- A refusal for a 0.90 USDC request, printed as the structured JSON
  `PreCheckResult` from `@leash/sdk` (for example
  `{ "ok": false, "error": "per_tx_cap_exceeded", "spent": "0", "cap": "500000" }`),
  followed by a line spelling out that the contract refused it and that no
  transaction was sent.

## Same sequence, as MCP tool calls

If you are integrating Leash into an agent rather than running this script,
the equivalent sequence is the two tools the MCP server (`mcp/`) exposes —
no raw `LeashClient` calls needed:

```
# 1. Check the allowance before spending (equivalent to remainingToday + limits)
leash_status()
# => { remaining_today: "...", daily_cap: "...", per_tx_cap: "...", ... }

# 2. Three small payments (equivalent to preCheck + spend, three times)
leash_pay({ to: "<SPEND_PAYEE>", amount: "0.01" })
leash_pay({ to: "<SPEND_PAYEE>", amount: "0.01" })
leash_pay({ to: "<SPEND_PAYEE>", amount: "0.01" })
# each returns { ok: true, transaction: "0x...", explorer: "https://celoscan.io/tx/..." }

# 3. Ask for more than the per-transaction cap allows
leash_pay({ to: "<SPEND_PAYEE>", amount: "0.90" })
# => { error: "per_tx_cap_exceeded", message: "the on-chain policy refused a
#      payment of 0.90", requested: "0.90", ... }
```

`leash_pay` runs the same `preCheck`-then-`spend` sequence as this script
internally, so the refusal is the same on-chain `staticcall` — free, and
sent by the contract, not by the model. See `mcp/src/tools/pay.ts` and
`mcp/src/tools/status.ts` for the implementation.
