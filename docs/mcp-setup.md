# Use Leash with your agent

> **Came from the wizard with a `.mcp.json` in hand?** You do not need this
> page. [`docs/quickstart.md`](quickstart.md) is the eight steps that follow
> that block, and nothing else. Come back here for what each variable means,
> for deploying an account from the command line, or when something below is
> the reference you actually want.

Leash gives an AI agent a wallet without trusting it. Funds sit in a contract,
the agent can only ask that contract to spend, and the contract reverts past
your limits. The limits are code on Celo, not a sentence in a prompt.

There are two ways to get a protected account, and only one of them needs this
repository.

**In the browser, with nothing installed.** Open
<https://leash-app-phi.vercel.app/setup> and connect an owner wallet. The
four-stage wizard creates the account, sets policy, authorizes the agent wallet
and funds both balances, and its last stage hands you the `.mcp.json` from
section 2 with your account already filled in. Nothing about that path requires
a clone, and it is the shortest route for most people. Section 1 below is then
reference rather than instruction. (Running the app yourself with
`pnpm --filter @leash/app dev` does the same thing, and is for working on it.)

**From the command line**, which is what section 1 describes. This one *does*
need the repository: `forge create` compiles
`contracts/src/SpendPolicyAccount.sol`, so you need the contract source and
Foundry.

**Section 0 applies either way.** Both paths ask for the agent's **address**
and never its private key; section 2 asks for the key. Making that wallet
first is what stops a finished setup from stalling on a key you cannot export.

**Section 2 needs neither.** The server installs from npm as `leash-agentpay`,
so connecting an agent requires no clone and no `pnpm install` — only Node >= 20,
which `npx` needs to run it.

## 0. Make the agent's wallet first

**Taking the wizard? Skip this section.** Step 3 has a *Generate agent wallet*
button: it makes the keypair in your browser, fills in the address, and shows
you the private key once. Nothing to install.

This document's path asks for the agent's **address** when you call
`setOperator`, and then section 2 below asks for its **private key**. Generate
it now, in one place, so you are not exporting a key out of a browser extension
halfway through:

```bash
cast wallet new
# Address:     0x…   <- paste this into setOperator
# Private key: 0x…   <- this becomes OPERATOR_PK in section 2
```

No `cast`? Any keypair generator works; the wallet is an ordinary EOA. What
matters is that you can read the private key back out. The wizard's button is
not a way out of this section — step 3 unlocks only after you have deployed an
account and set its limits, so it helps the wizard's path and not this one.

**This wallet needs no CELO, ever.** It pays gas in USDC through Celo's fee
abstraction, which is the whole reason it can be a throwaway key. Around
0.05 USDC in it is about 17 transactions.

**It must not be your owner wallet.** The owner can `sweep()` past every limit,
so an owner key sitting in an agent's config defeats the entire product.

## 1. Deploy your own account

*Skip this section if you used the browser wizard — it has already done all of
it. Read it anyway if you want to know what those four stages actually sent.*

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

This is the block the wizard's last stage gives you with `LEASH_ACCOUNT`
already filled in, and the same one the dashboard keeps under **Connect your
agent runtime** for when you did not save it. Copying it from there saves
typing an address; the two are otherwise identical.

```json
{
  "mcpServers": {
    "leash": {
      "command": "npx",
      "args": ["-y", "leash-agentpay"],
      "env": {
        "LEASH_ACCOUNT": "0xYourSpendPolicyAccount",
        "OPERATOR_PK": "0xYourAgentOperatorPrivateKey"
      }
    }
  }
}
```

| variable | what it is |
|---|---|
| `LEASH_ACCOUNT` | Your `SpendPolicyAccount` from step 1. This is where the money lives and where the limits are enforced. |
| `OPERATOR_PK` | The private key of the wallet you passed to `setOperator`. **A hot key — see the warning below.** |
| `CELO_RPC_URL` | Optional. Defaults to `https://forno.celo.org`. |
| `ATTRIBUTION_TAG` | Optional, and only for a builder shipping their own registered product on top of this server. Your ERC-8021 code, `celo_` plus 12 hex characters; it rides in the same suffix as Leash's own. See below. |
| `SPEND_TOKEN` | Optional. The token the agent spends. Defaults to USDC on Celo mainnet, `0xcebA…118C`. Set it only if your account's policy is on some other token — `setPolicy` is per-token, and a policy set on one token reads as a cap of zero on every other. |
| `FEE_ADAPTER` | Optional. Which stablecoin pays gas. Defaults to the USDC fee adapter, `0x2F25…2B33`, which is what makes the agent need **no CELO at all**. |

**Two variables, not five.** All three of the others are still accepted and
none of them is a value you can usefully decide:

- `SPEND_TOKEN` and `FEE_ADAPTER` were required until 0.4.0. They are two
  42-character addresses with one correct value between all users, which a
  reader had no way to check and which failed differently when mistyped — a
  wrong adapter is rejected at the node when the first transaction is sent, and
  a wrong token is never rejected at all, it simply reports a daily cap of zero
  forever.
- `ATTRIBUTION_TAG` was required until 0.5.0, and asked for something worse: a
  code standing for an entity you are not. See the section below.

Setting any of them still overrides the default; setting one to a malformed
value is still refused at startup rather than quietly replaced.

The server holds no keys of its own and adds no logic. It reads the chain and
signs with the operator key you gave it.

### `ATTRIBUTION_TAG`, and why you almost certainly do not need it

Every transaction this server sends carries an ERC-8021 attribution code in its
data suffix. There is no untagged path. Until 0.5.0 that code came from
`ATTRIBUTION_TAG` and the server refused to start without one — which asked
every user for a value they did not have and could not reason about.

The rule that settles it is `@celo/attribution-tags`':

> each code should only be added by the entity it represents. **Your app emits
> its own code**; platform codes like `minipay` are added by the platform's
> wallet, not by your app.

The entity that built and signed these transactions is `leash-agentpay`, whoever
started it. So the server emits Leash's own registered code, `celo_3dec652cd977`,
and there is nothing for you to fill in.

That also retires the advice this page used to give — generate twelve random hex
characters. A code invented that way represents nobody at all, which is strictly
less true than the one the server now emits.

**Set `ATTRIBUTION_TAG` only if you have a registered code of your own**, from
Celo Builders or elsewhere, because you are shipping your own product on top of
this server. Then the suffix carries both: Leash's code because Leash built the
transaction, yours because you built the product. That is the layering the rule
describes, not an exception to it.

Two things worth knowing if you do:

- **The shape is checked at startup**, against `/^celo_[0-9a-f]{12}$/`. A
  malformed code exits before the first tool call, which an agent reports only
  as "server failed to connect".
- **Attribution is not retroactive.** A transaction already mined without your
  code can never gain it, so set it before you start rather than after you
  notice a leaderboard reading zero.

**Do not paste a code you found in someone else's repository.** A code is an
attribution target: borrowing a registered one credits your product's volume to
whoever registered it. Leash's own is emitted by the server for you, so there is
never a reason to copy it into your config.

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

Use `get` rather than `list`. Current Claude Code shows an unapproved
`.mcp.json` server as `⏸ Pending approval` in both, but only `get` names the
one server you are asking about; `list` puts it in a column you have to find.
(An earlier version of this page claimed `list` hides such a server entirely.
That is no longer what the CLI documents — `claude mcp --help` describes the
pending state for both subcommands.)

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
| `leash_fetch` | Call an x402-gated URL and pay for it. Speaks x402 v1 and v2. Pass `quote_only: true` to see the price without paying. |

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
agent to sign for itself, so any shortfall must first move to the operator
wallet via `topUpOperator`. The per-transaction and daily caps apply to that
draw, but the **payee allowlist cannot** — once money leaves the contract, the
contract cannot police where it goes.

**A purchase the operator can already afford skips the draw entirely**, and then
no cap is consulted at all: `drawn_from_account` comes back `0.000000` and
`spent_today` does not move. Two mainnet purchases behaved exactly this way, so
this is the ordinary case for a small buy, not an edge case. Whatever float sits
in the operator wallet is what the agent can spend on x402 without the contract
being asked — keep it thin and keep the bulk in the account.

So the guarantee for x402 is *"the agent can never draw more than X per day out
of the account"*. It is not *"the agent can only ever pay these people"*, and it
is not *"every x402 purchase is capped"*.
