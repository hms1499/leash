# Connect your agent — copy, paste, run

You finished the [setup wizard](https://leash-app-phi.vercel.app/setup) and
clicked **Copy** on the `.mcp.json` block. Everything below is commands you can
paste. Nothing here asks you to write code, and you do not need to clone this
repository.

**You will edit exactly one value**: `OPERATOR_PK`, the private key of the agent
wallet the wizard shows you. Everything else in the block is already filled in.

**Keep the wizard tab open until you finish step 3.** You are holding two
things that do not survive being left alone: the block, which lives in your
clipboard until something else is copied, and the agent's private key, which
the wizard shows once and cannot show again. Steps 1 to 3 put both on disk and
need nothing installed, which is why they come before the installs rather than
after them. Lose the key and the way back is authorising a new agent wallet —
another mainnet transaction, paid for again.

## Before you start

| | |
|---|---|
| **Node 20 or newer** | Only the Leash server needs it, and `npx` fetches the server itself. Step 4 checks. |
| **An MCP client** | This guide uses **Claude Code**. Cursor and Codex read the same `.mcp.json` — the server speaks plain stdio MCP and does not care which one starts it. |
| **A paid Claude plan** | Pro, Max, Team, Enterprise or Console. **Claude Code only** — it is not in the free plan. If you are using Cursor or Codex, skip this and skip step 5 — steps 1-3 and 6 apply to you unchanged. |

None of this is needed to *create* a protected account. The wizard finishes
without it and the account is already protected; this guide is the optional
step that hands the account to an agent.

---

## 1. Make a project folder

This is where the agent will work, and where the config has to live. Not your
home directory.

Nothing is installed yet and nothing needs to be: this step and the two after
it are a folder and a text file. Do them first and the two things you are
holding — the block in your clipboard and a key you were shown once — are on
disk before anything can take them away.

**macOS**

```bash
mkdir -p ~/my-agent
cd ~/my-agent
```

**Windows PowerShell**

```powershell
mkdir ~/my-agent
cd ~/my-agent
```

## 2. Add `.mcp.json` to the folder

Save the block from your clipboard as a file named `.mcp.json` inside the folder
you made in step 1:

```
~/my-agent/
└── .mcp.json
```

## 3. Paste the operator key

Open `.mcp.json` in any text editor — TextEdit on macOS, Notepad on Windows —
and replace `0xYourAgentOperatorPrivateKey` with the private key of the agent
wallet the wizard shows you: `0x` followed by 64 hex characters. Save the file.

Paste an *address* here by mistake (40 characters) and the server refuses to
start.

**This is the last step that needs the wizard tab.** Once the key is saved here
you can close it. That file is now a secret — anyone who reads it can spend up
to your limits.

## 4. Install Node

The Leash server runs through `npx`, which needs **Node 20 or newer**. (Claude
Code itself does not use Node — this is only for the server.)

Check what you have:

```bash
node -v
```

If that prints `v20` or higher, skip ahead. If it says `command not found` or
prints something older:

**macOS**

```bash
brew install node
```

**Windows, or macOS without Homebrew** — download the LTS installer from
<https://nodejs.org/en/download> and run it.

Confirm before moving on:

```bash
node -v      # v20.x or newer
```

## 5. Install Claude Code

**macOS**

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows PowerShell**

```powershell
irm https://claude.ai/install.ps1 | iex
```

Confirm it landed:

```bash
claude --version      # prints something like 2.1.266 (Claude Code)
```

## 6. Fetch the Leash server

**There is no install step for `leash-agentpay`, and you are not missing one.**
The `.mcp.json` block runs it with `npx -y`, which downloads the package the
first time Claude Code starts it and caches it after that. Nothing goes into
your project and nothing is installed globally.

That first download happens invisibly, inside Claude Code's startup, where a
network failure surfaces only as "server failed to connect". Pull it now
instead, so you find out here.

**This command is supposed to fail.** Run it from anywhere — it reads
environment variables, not your `.mcp.json`, so it will stop for want of a key
and that is the point:

```bash
npx -y leash-agentpay
```

The failure you want, exactly:

```
Error: OPERATOR_PK is not set. The Leash MCP server needs it to start.
```

That error is the success condition for this step: the package downloaded, ran,
read its configuration, and stopped because this particular invocation was
given none. The key you saved in step 3 is not missing — Claude Code passes it
in when *it* starts the server, which is step 7.

Any other outcome is a real problem — `command not found: npx` means step 4 did
not take, and a registry or network error means `npx` could not reach npm.

## 7. Start Claude Code

From the same folder:

```bash
claude
```

Two prompts on first run:

1. **Log in.** It opens your browser. Sign in with your Claude account.
2. **Approve the server.** Claude Code asks, once, whether to run the server
   `.mcp.json` names. **Say yes** — decline and the tools silently never appear.

## 8. Check that it works

Inside the Claude Code session, type:

```
/mcp
```

`leash` should show `✔ Connected` with a tool count of 3. Then just ask, in
plain English:

```
Call leash_status and tell me my remaining daily allowance.
```

A reply with a number means you are done. Your agent can now spend, up to the
limits your contract enforces.

---

## If the tools do not appear

Both of these look identical from inside the agent. Work down the table.

| what you see | what happened | fix |
|---|---|---|
| No `leash_*` tools, no error at all | You declined the approval prompt, or never got it. Nothing reports this. | `/mcp` shows `⏸ Pending approval` if you never answered. If you declined, `claude mcp reset-project-choices` clears the choice; restart `claude` and answer yes. |
| "server failed to connect" | `OPERATOR_PK` is not a 32-byte hex key. | Paste the key: `0x` plus 64 hex characters. |

The real message is `OPERATOR_PK is not a 32-byte hex private key`. Your agent
buries it behind "server failed to connect", which is why the table matches on
the config instead of on the message.

This table had a third row until leash-agentpay 0.5.0, for an `ATTRIBUTION_TAG`
left at `celo_yourtag`. That row is gone because the variable is: the server
emits its own ERC-8021 code and the block no longer carries the field. It was
the most-hit row here, which is the point.

Started `claude` in the wrong folder? `.mcp.json` is read from the directory you
launch it in. `cd ~/my-agent` and run `claude` again.

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
