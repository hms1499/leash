# leash-agentpay

**Give an AI agent a wallet without trusting it.** An MCP server that lets an
agent spend real stablecoins on Celo, with the limits enforced by a contract
instead of by a sentence in a prompt.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](https://github.com/hms1499/leash/blob/main/LICENSE)
[![Network: Celo Mainnet](https://img.shields.io/badge/Network-Celo%20Mainnet-fcff52.svg)](https://celoscan.io/)

Funds sit in a `SpendPolicyAccount` you own. The agent is only an *operator*: it
can ask the contract to spend, and the contract reverts past your per-transaction
cap, your daily cap, and your payee allowlist. A leaked agent key costs you one
day's allowance, not the balance.

- **Repo, contract source and on-chain proofs:** <https://github.com/hms1499/leash>
- **Full setup guide:** <https://github.com/hms1499/leash/blob/main/docs/mcp-setup.md>
- **Hosted deploy wizard:** <https://leash-app-phi.vercel.app/setup>

Requires **Node >= 20**.

## Configure

Deploy your own account first — see the setup guide. **Do not point
`LEASH_ACCOUNT` at someone else's contract**; its owner can sweep your funds.

```json
{
  "mcpServers": {
    "leash": {
      "command": "npx",
      "args": ["-y", "leash-agentpay"],
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
| `LEASH_ACCOUNT` | Your `SpendPolicyAccount`. Where the money lives and where the limits are enforced. |
| `OPERATOR_PK` | Private key of the wallet you passed to `setOperator`. **A hot key — see below.** |
| `ATTRIBUTION_TAG` | Your ERC-8021 tag, `celo_` plus 12 hex characters. Every transaction carries it; there is no untagged path. |
| `SPEND_TOKEN` | The token the agent spends. The value above is USDC on Celo mainnet. |
| `FEE_ADAPTER` | Which stablecoin pays gas. The value above is the USDC adapter, so the agent needs **no CELO at all**. |
| `CELO_RPC_URL` | Optional. Defaults to `https://forno.celo.org`. |

The server holds no keys of its own and adds no logic. It reads the chain and
signs with the operator key you give it.

## ⚠️ `OPERATOR_PK` is a hot key

It sits in a config file your agent's runtime reads. Treat it as
compromised-in-waiting and give it nothing to lose:

- **Keep only gas money in the operator wallet** — about 0.05 USDC is plenty at
  roughly $0.0022 a transaction. Money in that wallet is *outside* the contract
  and protected by no limit at all.
- **Keep the bulk in the contract**, where the caps apply.
- **Never let the operator key be the owner key.** The owner can `sweep()` past
  every limit, so an owner key in an agent's config defeats the whole product.

## Tools

| tool | what it does |
|---|---|
| `leash_status` | Remaining daily allowance, both caps, balances, and when the allowance resets. Tell your agent to call this before spending. |
| `leash_pay` | Pay a Celo address. Per-transaction cap, daily cap and the payee allowlist all apply. |
| `leash_fetch` | Call an x402-gated URL and pay for it. `quote_only: true` returns the price without paying. |

Every refusal comes back as JSON an agent can act on, never as a revert hex —
an agent routes around the first and stalls on the second:

```json
{ "error": "daily_cap_exceeded", "spent_today": "17.50", "daily_cap": "20.00",
  "remaining_today": "2.50",
  "suggestion": "Retry with 2.50 or less, or wait for the daily allowance to reset at UTC midnight." }
```

### `leash_pay` reports what the chain was seen to do

A transaction hash is not a payment. `leash_pay` waits for the chain and
returns one of three outcomes, which are deliberately not interchangeable:

| outcome | meaning | retry? |
|---|---|---|
| `ok: true` | A receipt was read and the payment succeeded. | — |
| `error: "spend_reverted"` | It landed and reverted. **No money moved**, only gas. The account changed between the check and the send. | Safe, after `leash_status` |
| `status: "sent_unconfirmed"` | Sent, but not observed inside the window. It may still land. | **Never.** A second call pays twice; there are no refunds. |

A `policy_unreadable` error means the node could not be reached, so no limit
was tested and nothing was sent — it is not a refusal, and there is no cap to
work around.

## Two limits worth knowing before you rely on this

**The daily allowance resets at UTC midnight**, not local midnight. The contract
counts days as `block.timestamp / 1 days`.

**`leash_fetch` gives a weaker guarantee than `leash_pay`.** x402 requires the
agent to sign for itself, so funds must first move to the operator wallet via
`topUpOperator`. The per-transaction and daily caps apply to that draw, but the
**payee allowlist cannot** — once money leaves the contract, the contract cannot
police where it goes. The guarantee for x402 is therefore *"the agent can never
reach more than X per day"*, not *"the agent can only ever pay these people"*.

## License

MIT
