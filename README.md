# Leash

Give an AI agent a wallet without trusting it. Spend limits and payee
allowlists are enforced on-chain, not by a prompt.

Built for the Celo "Agents at Work" hackathon.

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

## Use Leash with your agent

`docs/mcp-setup.md` — deploy your own account, paste one block into `.mcp.json`,
and your agent spends under limits you set. It assumes no knowledge of this
repository.

## Design

See `docs/superpowers/specs/2026-09-01-leash-design.md`.
