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

## Design

See `docs/superpowers/specs/2026-09-01-leash-design.md`.
