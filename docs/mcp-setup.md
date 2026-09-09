# Use Leash with your agent

Leash gives an AI agent a wallet without trusting it. Funds sit in a contract,
the agent can only ask that contract to spend, and the contract reverts past
your limits. The limits are code on Celo, not a sentence in a prompt.

This document covers the command-line path: make the agent's wallet, create a
protected account, then connect it to an agent runtime. If you would rather
prepare the account in the browser, run the app
(`pnpm --filter @leash/app dev`) and open `/setup`. That four-stage wizard
creates the account, sets policy, authorizes the agent wallet and funds both
balances. It deliberately stops at "ready": SDK or MCP connection is the
separate integration described in section 2 below.

**Section 0 applies either way.** The wizard asks for the agent's address and
never needs its private key; section 2 does. Making that wallet first is what
stops a finished setup from stalling on a key you cannot export.

**Before anything else:** Node >= 20, which `npx` needs to run the published
server. The server installs from npm as `leash-agentpay`, so you do not need
to clone this repo or run `pnpm install` to follow this guide.

## 0. Make the agent's wallet first

Both paths — this document and the browser wizard — ask for the agent's
**address** when you set it up, and then section 2 below asks for its
**private key**. Generate it now, in one place, so you are not exporting a key
out of a browser extension halfway through:

```bash
cast wallet new
# Address:     0x…   <- paste this into setOperator, or into the wizard
# Private key: 0x…   <- this becomes OPERATOR_PK in section 2
```

No `cast`? Any keypair generator works; the wallet is an ordinary EOA. What
matters is that you can read the private key back out.

**This wallet needs no CELO, ever.** It pays gas in USDC through Celo's fee
abstraction, which is the whole reason it can be a throwaway key. Around
0.05 USDC in it is about 17 transactions.

**It must not be your owner wallet.** The owner can `sweep()` past every limit,
so an owner key sitting in an agent's config defeats the entire product.

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
| `LEASH_ACCOUNT` | Your `SpendPolicyAccount` from step 1. This is where the money lives and where the limits are enforced. |
| `OPERATOR_PK` | The private key of the wallet you passed to `setOperator`. **A hot key — see the warning below.** |
| `ATTRIBUTION_TAG` | Your ERC-8021 tag, `celo_` plus 12 hex characters. Every transaction the server sends carries it. There is no untagged path. **Required — the server refuses to start without one.** See below for where to get it. |
| `SPEND_TOKEN` | The token the agent spends. The value above is USDC on Celo mainnet. |
| `FEE_ADAPTER` | Which stablecoin pays gas. The value above is the USDC fee adapter, so the agent needs **no CELO at all**. |
| `CELO_RPC_URL` | Optional. Defaults to `https://forno.celo.org`. |

The server holds no keys of its own and adds no logic. It reads the chain and
signs with the operator key you gave it.

### Where `ATTRIBUTION_TAG` comes from

`mcp/src/config.ts` requires it and checks its shape against
`/^celo_[0-9a-f]{12}$/`, so the server exits before its first tool call if it is
missing or malformed — and an agent reports that as "server failed to connect",
with the real message buried.

Two ways to have one:

- **Registered.** Celo Builders issues a tag when you register a project. That
  is the only kind that *counts* for anything: it is what attributes on-chain
  volume to you.
- **Your own.** Outside a hackathon nothing issues tags, and the suffix is only
  data. Generate twelve hex characters and use them:

  ```bash
  printf 'celo_%s\n' "$(openssl rand -hex 6)"
  ```

**Do not paste a tag you found in someone else's repository** — this one's
included. A tag is an attribution target, so borrowing a registered tag credits
your transactions to whoever registered it, not to you.

### Then approve it, and know what a refusal looks like

Put the block in `.mcp.json` at the root of the directory you open the agent
in, and restart. Agents do not trust a config file on sight: yours will ask
once, on startup, whether to run what the file names. **Say yes.**

If you say no, the three tools do not appear — and nothing tells you why.
There is no error and no warning; `leash_status` is simply not a tool your
agent has, which looks exactly like putting the file in the wrong place.
Restarting does not ask again. In Claude Code:

```bash
claude mcp get leash                  # ✘ Rejected, or ⏸ Pending approval
claude mcp reset-project-choices      # clears it; restart and answer yes
```

`claude mcp list` does **not** show a rejected server at all, so it is the
wrong command to check with — use `get`.

Add `.mcp.json` to your `.gitignore` before you paste a key into it, and add
`.mcp.json.*` alongside it: the natural thing to do before editing that file is
copy it to `.mcp.json.bak`, and the plain filename pattern does not cover the
backup.

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
