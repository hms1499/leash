# Use Leash with your agent

Leash gives an AI agent a wallet without trusting it. Funds sit in a contract,
the agent can only ask that contract to spend, and the contract reverts past
your limits. The limits are code on Celo, not a sentence in a prompt.

This document gets your own agent spending through your own account from the
command line. If you would rather click: run the app (`pnpm --filter @leash/app
dev`) and open `/`, where a wizard does every step below and hands you the
finished `.mcp.json` at the end.

**Before anything else:** Node >= 20, pnpm 9.12.0 (the root `package.json`
pins it), and `pnpm install` from the repo root. The MCP server is run
straight from source through `tsx`, and it imports `@leash/sdk` as a workspace
package — without `pnpm install` that import does not resolve and the server
exits before your agent sees it.

## 1. Deploy your own account

**Do not point `LEASH_ACCOUNT` at this project's contract.** That account's
owner key is ours: we could sweep your funds, and you could not set your own
policy. `SpendPolicyAccount` takes the owner address as its only constructor
argument, so deploy your own:

```bash
cd contracts
forge create src/SpendPolicyAccount.sol:SpendPolicyAccount \
  --rpc-url https://forno.celo.org \
  --private-key $YOUR_OWNER_PK \
  --constructor-args $YOUR_OWNER_ADDRESS
```

Then, as the owner, three calls to make it usable:

```bash
# 1. let your agent's wallet spend
cast send $ACCOUNT "setOperator(address,bool)" $AGENT_ADDRESS true \
  --rpc-url https://forno.celo.org --private-key $YOUR_OWNER_PK

# 2. set the limits, in the token's atomic units (USDC has 6 decimals,
#    so 500000 = 0.50 per transaction and 20000000 = 20.00 per day)
cast send $ACCOUNT "setPolicy(address,uint256,uint256)" \
  $SPEND_TOKEN 500000 20000000 \
  --rpc-url https://forno.celo.org --private-key $YOUR_OWNER_PK

# 3. fund it with a plain ERC-20 transfer to $ACCOUNT
cast send $SPEND_TOKEN "transfer(address,uint256)" $ACCOUNT 5000000 \
  --rpc-url https://forno.celo.org --private-key $YOUR_OWNER_PK
```

Neither cap may be zero. `daily = 0` is how the contract marks a token as
unconfigured, so it refuses every spend rather than allowing an unlimited one,
and `perTx = 0` refuses every non-zero amount. To halt an agent, pause the
account — that is reversible and says what it did.

The owner is deliberately **not** an operator. It sets policy, pauses, and
sweeps; it does not spend through the agent's paths. You do not spend *from*
the account either — you sweep back to your own wallet and spend from there.
The account is the agent's budget, not your wallet.

## 2. Add the server to your agent

```json
{
  "mcpServers": {
    "leash": {
      "command": "npx",
      "args": ["-y", "tsx", "/absolute/path/to/leash/mcp/src/index.ts"],
      "env": {
        "LEASH_ACCOUNT": "0xYourSpendPolicyAccount",
        "OPERATOR_PK": "0xYourAgentOperatorPrivateKey",
        "ATTRIBUTION_TAG": "celo_yourtag",
        "SPEND_TOKEN": "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
        "FEE_ADAPTER": "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B"
      }
    }
  }
}
```

| variable | what it is |
|---|---|
| `LEASH_ACCOUNT` | Your `SpendPolicyAccount` from step 1. This is where the money lives and where the limits are enforced. |
| `OPERATOR_PK` | The private key of the wallet you passed to `setOperator`. **A hot key — see the warning below.** |
| `ATTRIBUTION_TAG` | Your ERC-8021 tag, `celo_` plus 12 hex characters. Every transaction the server sends carries it. There is no untagged path. |
| `SPEND_TOKEN` | The token the agent spends. The value above is USDC on Celo mainnet. |
| `FEE_ADAPTER` | Which stablecoin pays gas. The value above is the USDC fee adapter, so the agent needs **no CELO at all**. |
| `CELO_RPC_URL` | Optional. Defaults to `https://forno.celo.org`. |

The server holds no keys of its own and adds no logic. It reads the chain and
signs with the operator key you gave it.

## ⚠️ `OPERATOR_PK` is a hot key

It sits in a config file that your agent's runtime reads. Treat it as
compromised-in-waiting, and give it nothing to lose:

- **Keep only gas money in the operator wallet** — around 0.05 USDC is plenty
  at roughly $0.0022 a transaction. The wallet outside the contract is *not*
  protected by any limit; whatever sits there, the agent can spend freely.
- **Keep the bulk in the contract**, where the caps apply.
- **Never let the operator key be the owner key.** The owner can `sweep()` past
  every limit, so an owner key in an agent's config defeats the entire product.

That is the whole design: a leaked operator key costs you one day's allowance,
not the balance.

## 3. What your agent can now do

| tool | what it does |
|---|---|
| `leash_status` | Remaining daily allowance, both caps, balances, and when the allowance resets. Tell your agent to call this before spending. |
| `leash_pay` | Pay a Celo address. Per-transaction cap, daily cap, and the payee allowlist (if enabled) all apply. |
| `leash_fetch` | Call an x402-gated URL and pay for it. Pass `quote_only: true` to see the price without paying. |

When the policy refuses, the tool returns JSON your agent can act on —

```json
{ "error": "daily_cap_exceeded", "spent_today": "17.50", "daily_cap": "20.00",
  "remaining_today": "2.50", "suggestion": "Retry with 2.50 or less, or wait
  for the daily allowance to reset at UTC midnight." }
```

— never a revert hex. An agent routes around the first and stalls on the second.

## Two limits worth knowing before you rely on this

**The daily allowance resets at UTC midnight**, not local midnight. The contract
counts days as `block.timestamp / 1 days`.

**`leash_fetch` gives a weaker guarantee than `leash_pay`.** x402 requires the
agent to sign for itself, so funds must first move to the operator wallet via
`topUpOperator`. The per-transaction and daily caps apply to that draw, but the
**payee allowlist cannot** — once money leaves the contract, the contract cannot
police where it goes. The guarantee for x402 is therefore *"the agent can never
reach more than X per day"*, not *"the agent can only ever pay these people"*.
