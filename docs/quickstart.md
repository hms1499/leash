# Connect your agent — copy, paste, run

You finished the [setup wizard](https://leash-app-phi.vercel.app/setup) and
clicked **Copy** on the `.mcp.json` block. Everything below is commands you can
paste. Nothing here asks you to write code, and you do not need to clone this
repository.

**You will edit exactly one value**: `OPERATOR_PK`, the private key of the agent
wallet the wizard shows you. Everything else in the block is already filled in.

You also need a Claude account on a paid plan — Pro, Max, Team, Enterprise, or
Console. Claude Code is not included in the free plan.

---

## 1. Install Node

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

**Ubuntu / Debian**

```bash
sudo apt update && sudo apt install -y nodejs npm
```

**Windows, or no package manager** — download the LTS installer from
<https://nodejs.org/en/download> and run it.

Confirm before moving on:

```bash
node -v      # v20.x or newer
```

## 2. Fetch the Leash server

**There is no install step for `leash-agentpay`, and you are not missing one.**
The `.mcp.json` block runs it with `npx -y`, which downloads the package the
first time Claude Code starts it and caches it after that. Nothing goes into
your project and nothing is installed globally.

That first download happens invisibly, inside Claude Code's startup, where a
network failure surfaces only as "server failed to connect". Pull it now
instead, so you find out here:

```bash
npx -y leash-agentpay
```

Expect it to **fail**, in exactly this way:

```
Error: OPERATOR_PK is not set. The Leash MCP server needs it to start.
```

That error is the success condition for this step: the package downloaded, ran,
read its configuration, and stopped because you have not given it any yet. You
will, in step 6.

Any other outcome is a real problem — `command not found: npx` means step 1 did
not take, and a registry or network error means `npx` could not reach npm.

## 3. Install Claude Code

**macOS, Linux, WSL**

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

If your shell says `command not found`, open a new terminal window first — the
installer adds `claude` to a path your current shell has not re-read.

## 4. Make a project folder

This is where the agent will work, and where the config has to live. Not your
home directory.

```bash
mkdir -p ~/my-agent
cd ~/my-agent
```

## 5. Save the block as `.mcp.json`

The block is still on your clipboard from the wizard. Write it straight to the
file:

**macOS**

```bash
pbpaste > .mcp.json
```

**Linux (X11)**

```bash
xclip -o -selection clipboard > .mcp.json
```

**Linux (Wayland)**

```bash
wl-paste > .mcp.json
```

**Windows PowerShell**

```powershell
Get-Clipboard | Set-Content .mcp.json
```

Lost the block? The dashboard keeps it under **Connect your agent runtime**,
with your account already filled in. Copy it again and rerun the command above.

Keep it out of git:

```bash
printf '.mcp.json\n.mcp.json.*\n' >> .gitignore
```

Check that the file looks right:

```bash
cat .mcp.json
```

## 6. Paste the operator key

Open the file:

```bash
nano .mcp.json
```

Replace `0xYourAgentOperatorPrivateKey` with the private key of the agent wallet
the wizard shows you — `0x` followed by 64 hex characters. In `nano`, save with
`Ctrl+O`, `Enter`, then exit with `Ctrl+X`.

Paste an *address* here by mistake (40 characters) and the server refuses to
start.

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

Two of these three look identical from inside the agent. Work down the table.

| what you see | what happened | fix |
|---|---|---|
| No `leash_*` tools, no error at all | You declined the approval prompt, or never got it. Nothing reports this. | `/mcp` shows `⏸ Pending approval` if you never answered. If you declined, `claude mcp reset-project-choices` clears the choice; restart `claude` and answer yes. |
| "server failed to connect" | `ATTRIBUTION_TAG` is still `celo_yourtag`. The server checks its shape at startup and exits before the first tool call. | Put a real tag in the wizard's field and copy the block again, or generate one: `printf 'celo_%s\n' "$(openssl rand -hex 6)"` |
| "server failed to connect" | `OPERATOR_PK` is not a 32-byte hex key. | Paste the key: `0x` plus 64 hex characters. |

The real messages are `ATTRIBUTION_TAG must look like celo_ plus 12 hex
characters, got "…"` and `OPERATOR_PK is not a 32-byte hex private key`. Your
agent buries both behind "server failed to connect", which is why the table
matches on the config instead of on the message.

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
