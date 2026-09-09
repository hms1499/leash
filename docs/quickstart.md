# Connect your agent — 5 steps

You finished the [setup wizard](https://leash-app-phi.vercel.app/setup) and it
handed you a `.mcp.json` block. This page is only the rest: getting that block
into Claude Code. It takes about two minutes and needs no clone of this
repository.

Your account already exists, already holds funds, and already enforces its
limits. Nothing below changes any of that — if you stop reading now, the
account keeps working; you just have no agent attached to it.

**Everything in the block is already filled in except one value: `OPERATOR_PK`.**
That is the private key of your agent's wallet, and the site never asks for it
because it must never see it. Step 3 is where you paste it.

---

## 1. Check Node

```bash
node -v      # must be v20 or newer
```

The block runs the published `leash-agentpay` package through `npx`, which
needs Node >= 20. Nothing else is installed and there is nothing to build.

## 2. Save the block

Put it in a file named exactly `.mcp.json`, at the root of the directory you
open Claude Code in. Not your home directory, not the Leash repo — the project
where you want the agent to be able to spend.

```
your-project/
├── .mcp.json      <- here
└── …
```

Lost the block? The dashboard keeps it under **Connect your agent runtime**,
with your account already filled in.

## 3. Ignore it before you paste the key

Do this *before* step 4, not after. Once a key is in the file, one careless
`git add` publishes it.

```bash
printf '.mcp.json\n.mcp.json.*\n' >> .gitignore
```

Both lines matter. The natural thing to do before editing that file is copy it
to `.mcp.json.bak`, and the plain filename does not cover the backup.

## 4. Paste the operator key

Open `.mcp.json` and replace `0xYourAgentOperatorPrivateKey` with the private
key of the agent wallet you authorised during setup. The wizard shows you which
address that is — the key must be *that* wallet's.

It is a 32-byte hex string: `0x` followed by 64 hex characters. If you paste an
**address** by mistake (40 characters) the server refuses to start, and your
agent reports it only as "server failed to connect".

> ⚠️ **This is a hot key.** Keep only gas money in the operator wallet — about
> 0.05 USDC covers ~17 transactions. Money in that wallet sits *outside* the
> contract and no limit protects it. The bulk stays in the account, where the
> caps apply. **Never use your owner key here:** the owner can `sweep()` past
> every limit, which defeats the entire point.

## 5. Restart and approve

Restart Claude Code. It will ask, once, whether to run the server the file
names. **Say yes** — decline and the tools silently never appear.

Then confirm:

```bash
claude mcp get leash
```

Finally, ask your agent to call `leash_status`. A reply with your remaining
daily allowance means you are done.

---

## If the tools do not appear

Three things go wrong here, and two of them look identical from inside the
agent. Work down the table.

| what you see | what happened | fix |
|---|---|---|
| No `leash_*` tools, no error at all | You declined the approval prompt, or never got it. Nothing reports this. | `claude mcp get leash` shows the state. `claude mcp reset-project-choices` clears it; restart and answer yes. |
| "server failed to connect" | `ATTRIBUTION_TAG` is still `celo_yourtag`. The server checks its shape at startup and exits before the first tool call. | Put a real tag in the wizard's field and copy the block again, or generate one: `printf 'celo_%s\n' "$(openssl rand -hex 6)"` |
| "server failed to connect" | `OPERATOR_PK` is not a 32-byte hex key — usually an address pasted instead of a key. | Paste the key: `0x` plus 64 hex characters. |

The real messages are `ATTRIBUTION_TAG must look like celo_ plus 12 hex
characters, got "…"` and `OPERATOR_PK is not a 32-byte hex private key`. Your
agent buries both behind "server failed to connect", which is why the table
above matches on the config instead of on the message.

Do not paste an attribution tag out of someone else's repository, this one's
included. A tag is an attribution target: borrowing a registered one credits
your transactions to whoever registered it.

## What your agent can now do

| tool | what it does |
|---|---|
| `leash_status` | Remaining daily allowance, both caps, balances, and when the allowance resets. Tell your agent to call this before spending. |
| `leash_pay` | Pay a Celo address. Both caps and the payee allowlist apply. |
| `leash_fetch` | Call an x402-gated URL and pay for it. `quote_only: true` prices it without paying. |

Refusals come back as JSON your agent can act on, never as a revert hex.

---

**Everything else** — deploying your own account from the command line, setting
policy with `cast`, what each environment variable means, and the two limits
worth knowing before you rely on this (the allowance resets at **UTC** midnight,
and `leash_fetch` gives a weaker guarantee than `leash_pay`) — is in
[`docs/mcp-setup.md`](mcp-setup.md).
