# Connect your agent — 4 steps

You finished the [setup wizard](https://leash-app-phi.vercel.app/setup) and it
handed you a `.mcp.json` block. This page is only the rest: getting that block
into Claude Code. It needs no clone of this repository.

**Everything in the block is filled in except one value: `OPERATOR_PK`**, the
private key of the agent wallet you authorised during setup. Step 3 is where
you paste it.

---

## 1. Check Node

```bash
node -v      # must be v20 or newer
```

The block runs the published `leash-agentpay` package through `npx`. Nothing is
installed and there is nothing to build.

## 2. Save the block

Put it in a file named exactly `.mcp.json`, at the root of the directory you
open Claude Code in — the project where you want the agent to be able to spend,
not your home directory and not the Leash repo.

```
your-project/
├── .mcp.json      <- here
└── …
```

Add `.mcp.json` and `.mcp.json.*` to `.gitignore`.

Lost the block? The dashboard keeps it under **Connect your agent runtime**,
with your account already filled in.

## 3. Paste the operator key

Replace `0xYourAgentOperatorPrivateKey` with the private key of the agent wallet
the wizard shows you. It is `0x` followed by 64 hex characters — paste an
address by mistake (40 characters) and the server refuses to start.

## 4. Restart and approve

Restart Claude Code. It asks, once, whether to run the server the file names.
**Say yes** — decline and the tools silently never appear.

Then confirm:

```bash
claude mcp get leash
```

Finally, ask your agent to call `leash_status`. A reply with your remaining
daily allowance means you are done.

---

## If the tools do not appear

Two of these three look identical from inside the agent. Work down the table.

| what you see | what happened | fix |
|---|---|---|
| No `leash_*` tools, no error at all | You declined the approval prompt, or never got it. Nothing reports this. | `claude mcp get leash` shows the state. `claude mcp reset-project-choices` clears it; restart and answer yes. |
| "server failed to connect" | `ATTRIBUTION_TAG` is still `celo_yourtag`. The server checks its shape at startup and exits before the first tool call. | Put a real tag in the wizard's field and copy the block again, or generate one: `printf 'celo_%s\n' "$(openssl rand -hex 6)"` |
| "server failed to connect" | `OPERATOR_PK` is not a 32-byte hex key. | Paste the key: `0x` plus 64 hex characters. |

The real messages are `ATTRIBUTION_TAG must look like celo_ plus 12 hex
characters, got "…"` and `OPERATOR_PK is not a 32-byte hex private key`. Your
agent buries both behind "server failed to connect", which is why the table
matches on the config instead of on the message.

## What your agent can now do

| tool | what it does |
|---|---|
| `leash_status` | Remaining daily allowance, both caps, balances, and when the allowance resets. Tell your agent to call this before spending. |
| `leash_pay` | Pay a Celo address. Both caps and the payee allowlist apply. |
| `leash_fetch` | Call an x402-gated URL and pay for it. `quote_only: true` prices it without paying. |

Refusals come back as JSON your agent can act on, never as a revert hex.

---

**Everything else** — deploying your own account from the command line, setting
policy with `cast`, what each environment variable means, how the operator key
is meant to be handled, and the two limits worth knowing before you rely on
this (the allowance resets at **UTC** midnight, and `leash_fetch` gives a weaker
guarantee than `leash_pay`) — is in [`docs/mcp-setup.md`](mcp-setup.md).
