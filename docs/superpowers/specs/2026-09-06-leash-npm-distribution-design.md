# Leash — npm distribution

Design, 2026-09-06. Supersedes nothing; adds a distribution path the project
has never had.

## Why

Leash is complete, live on mainnet, and effectively uninstallable. The MCP
server — which `CLAUDE.md` calls "the funnel, not an accessory" — reaches a
stranger only as a git clone: `pnpm install` under a pinned pnpm 9.12.0, then a
`.mcp.json` block carrying the literal string
`/absolute/path/to/leash/mcp/src/index.ts` that they must edit by hand.

That last step is the defect this design exists to remove. Editing it wrong
produces "server failed to connect" in the agent, with the real cause buried —
the same class of failure as `a46fa52`, where the landing page shipped a config
block that could not start.

**Goal:** a stranger goes from the hosted wizard to a working agent in about
five minutes, without cloning anything and without asking the maintainer a
question.

## Scope

Decided with the maintainer on 2026-09-06:

- **Shape:** open-source, self-hosted. No backend, no accounts, no custody.
- **First user:** a solo developer wiring their own MCP agent, with $10–100 in
  the contract. Losing all of it is survivable.
- **Therefore:** the existing contract is adequate as it stands. Its known
  limits are written down in `README.md` and are not addressed here.

### Out of scope

Publishing the SDK · contract v2 (ownership transfer, a `topUpOperator` switch,
a factory) · an audit · multi-chain · multi-token in the UI · teams, auth, or
any hosted backend. These belong in the README's roadmap, not in this work.

**The SDK is deliberately not published.** It has exactly one consumer, and
publishing it would commit the project to a public API and a semver contract
for a library nobody has asked for. It is bundled into the server instead.
Anyone wanting it directly can still clone. When a real user asks, publish it
then — not before.

## The package

**`leash-agentpay`**, verified free on the registry on 2026-09-06.
`npx -y leash-agentpay` is the whole install.

`leash-mcp` was the obvious name and is already taken (v1.0.0 by an unrelated
project), as is the `@leash` scope (`@leash/sdk@0.4.4`). Check a name before
building a design around it.

Renaming `@leash/mcp` to `leash-agentpay` changes the workspace filter used in
`CLAUDE.md`, `README.md`, and `docs/RESUME.md` (`pnpm -F @leash/mcp test`).
Mechanical, but it is three files that will otherwise print instructions that
do not run.

## Build

`tsup` (an esbuild wrapper), minimal config, emitting one ESM bundle.

- **Inline `@leash/sdk`.** It is a `workspace:*` dependency and cannot resolve
  from the registry. This is the one thing the bundle must do.
- **Keep `viem`, `@modelcontextprotocol/sdk` and `@celo/attribution-tags` as
  real dependencies.** Not bundled: the output stays small and a security patch
  in viem reaches users through ordinary resolution rather than a republish.
- Target node20, ESM, shebang `#!/usr/bin/env node`.
- `bin: { "leash-agentpay": "dist/index.js" }`, `files: ["dist"]`,
  `engines: { node: ">=20" }`, and `"private": true` removed.

`tsx` leaves the runtime entirely. Today the shebang is
`#!/usr/bin/env -S npx tsx`, so every server start fetches `tsx` over the
network — slow, and broken offline.

### The hazard this build must not introduce

`mcp/src/index.ts:93` reads:

```ts
const { quote, payForResource } = await import('@leash/sdk')
```

A **dynamic** import, reached only inside the `leash_fetch` branch. If the
bundler leaves it external, `leash_status` and `leash_pay` work perfectly and
`leash_fetch` fails at runtime, on a user's machine, in a path no test in this
repository exercises.

That is this project's signature failure — a correct path with a wrong account
of itself, found only by someone actually driving it. Verification below treats
`leash_fetch` as a separate case for exactly this reason, and it is not
optional.

## What changes in the app

`app/lib/mcpJson.ts` emits:

```json
"command": "npx",
"args": ["-y", "leash-agentpay"]
```

in place of the absolute path. The blast radius is one source file, one test
file (`app/test/mcpJson.test.ts`), and `docs/mcp-setup.md`. `McpHandoff.tsx`
consumes the builder and needs no change; the landing page and `/setup` both
render through it, so they cannot drift apart — which is the property
`a46fa52` established and this design keeps.

Historical plans and specs under `docs/superpowers/` mention the old path.
They are records of decisions already taken and are not edited.

## Verification

The claim is "five minutes, no questions". It gets measured, not reasoned about.

1. **Before publishing:** `npm pack`, install the tarball into an empty
   directory outside the repository, and start the server with no environment.
   It must fail with `OPERATOR_PK is not set` — the same error the local
   source produces today, confirmed on 2026-09-06. Any module-resolution error
   instead means the bundle is wrong.
2. **`leash_fetch` specifically**, against a real x402 quote with
   `quote_only`, from the installed tarball. This is the dynamic-import path;
   nothing else covers it.
3. **After publishing:** `npx -y leash-agentpay` from a clean npm cache, in a
   directory that is not the repo.
4. **The whole stranger's walk, timed:** open the hosted wizard, deploy an
   account, copy the block, and have an agent call `leash_status` successfully.
   If it does not fit in five minutes, the number in the README changes — the
   walk does not get re-described.

## CI

GitHub Actions, on push and pull request: `forge test`, the four pnpm suites,
`tsc --noEmit` across all five packages, and a job that runs `npm pack` and
smoke-starts the bundle. The repository has 292 tests and has never run one
automatically; the pack job is what keeps a broken bundle from reaching a user
rather than a reviewer.

## Prerequisites the maintainer owns

`npm login` on the machine that publishes. `npm whoami` returned 401 here on
2026-09-06.

## Order of work

Dependency order, not a calendar. Each step is independently useful and none
touches what a user sees until the step that does.

1. Build pipeline: `tsup`, package metadata, the rename. Nothing user-visible.
2. Verification 1 and 2 against the tarball. **Stop here if `leash_fetch`
   fails.**
3. Publish `0.1.0`. Verification 3.
4. Flip `mcpJson.ts`, its test, `docs/mcp-setup.md`, `README.md`.
5. CI.
6. Verification 4, timed, and correct the README against what it measures.
