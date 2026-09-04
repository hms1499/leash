# Resume Here — Leash

Session paused 2026-09-03. This file is the entry point for the next session.
Read it before anything else, then read the documents it points at.

## What this project is

Leash gives an AI agent a wallet without trusting it. Funds sit in a contract,
not in the agent's wallet; the agent can only ask the contract to spend, and the
contract reverts past its limits. The limits are code on Celo, not a sentence in
a prompt, so a leaked agent key does not become an unbounded one.

- **Primary track:** `judges-favorite` · **Secondary:** `askbots-growth` (not entered yet)
- **Deadline:** 2026-09-14 09:00 GMT (16:00 ICT, Monday) — **11 days left**
- **Repo:** https://github.com/hms1499/leash (public)

## Read these, in order

1. `docs/superpowers/specs/2026-09-01-leash-design.md` — the design. Binding authority.
2. `docs/deployments.md` — what is live, what it cost, and the proof for every claim.
3. `docs/mcp-setup.md` — the product surface, written for a stranger. Read it to
   see what a user actually receives.
4. `spikes/README.md` — every chain assumption that was tested, with evidence.
5. `.superpowers/sdd/2026-09-03-leash-frontend/progress.md` — the current
   ledger, including the whole-branch review and what it found.
   `.superpowers/sdd/2026-09-01-leash-foundation/progress.md` is the earlier one.
   **Both gitignored, living only on this machine.** `git clean -fdx` would
   destroy them.

All three plans in `docs/superpowers/plans/` are **done**; read them only for
context on decisions already taken.

## State: all three plans complete. Reviewed, and the review's fixes applied.

| Suite | Status |
|---|---|
| `cd contracts && forge test` | 32/32 |
| `cd sdk && pnpm run test` | 42/42 |
| `cd mcp && pnpm run test` | 12/12 |
| `cd app && pnpm run test` | 110/110 |
| `cd app && pnpm run test:e2e` | 6/6 (Playwright, against a local build) |
| `tsc --noEmit` in `sdk`, `mcp`, `spikes`, `app`, `examples` | exit 0 |

Gate tests are excluded from the ordinary runs. `pnpm -F @leash/sdk test:gate`
and `pnpm -F @leash/mcp test:gate` **spend real money** — see Hazards.

### Live on Celo mainnet

| | |
|---|---|
| `SpendPolicyAccount` | `0x7aDa926B021BAef4896F51F237bCA61435E43fd2` (source-verified) |
| Superseded instance | `0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` — **do not use.** It accepted native CELO that could never be recovered; swept to 0 and replaced. See `docs/deployments.md`. |
| Owner EOA | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` — 3.5639 CELO |
| Operator EOA (= registered `agentWalletAddress`) | `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6` — **0 CELO**, 0.012215 USDC |
| Attribution tag | `celo_3dec652cd977` |
| ERC-8004 identity | agentId 9804, owned by the operator |
| Policy | USDC: perTx 0.50, daily 1.00. `paused` false, allowlist off |
| Contract holds | 2.496567 USDC · `remainingToday` 1.000000 |

Read back from mainnet on 2026-09-03. The figures above are the state, not a
recollection of it.

### Proven on mainnet, not asserted

- **Zero-CELO gas.** The operator holds exactly 0 CELO and still transacts,
  paying in USDC. `0x1d10d9cb…6595`.
- **Attribution round-trips.** `0xb91ba357…fca4`, decoded off-chain and again
  straight from raw chain data.
- **The policy gates an on-chain spend.** `0x3fb0324f…1f70`: `remainingToday`
  fell by exactly the amount spent.
- **A real x402 purchase.** `0x0ac87832…b46e` — paid from the operator's own
  leftovers, never touching the contract.
- **x402 paid with money drawn through the policy.** Top-up `0xec08a200…33db`,
  settlement `0xb5dd4d16…1e25`. The daily counter fell by exactly the draw.
  This is the one that proves Path B; the bullet above does not.

## Next: everything left needs a human, a wallet, or both

The code is complete and reviewed. Nothing below is blocked on more building.

1. **Connect a real wallet on Celo and click every write path once** — limits,
   stop, resume, deploy, add agent, refuel — including a deliberate rejection
   and a deliberate wrong-chain attempt. **No browser wallet connected during
   the entire frontend plan.** Every write is unit-tested and none has been
   clicked. This will find more than any further review.
2. **Deploy to Vercel** (`app/`), then run the smoke test against the
   production URL: `LEASH_E2E_URL=https://… pnpm -F @leash/app test:e2e`. Set
   `NEXT_PUBLIC_CELO_RPC_URL` there — otherwise every visitor shares public
   forno, and the dashboard makes 18 `getLogs` calls per load. Then replace
   the "A hosted URL will be added here" line in `README.md`.
3. **Run the mainnet demo** — the agent that spends and then gets blocked.
   Still never run against the live chain. It refuses to start without its
   money gate: `LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm -F @leash/examples demo`.
   Costs roughly 0.03 USDC plus gas.
4. **Top up the operator before filming.** It holds 0.012215 USDC and 0 CELO;
   each transaction costs ~0.0028 and reserves ~0.0046, so that is two or
   three transactions. The demo needs at least three consecutive `leash_pay`
   calls. 0.05 USDC is comfortable.

### Known and deliberately unfixed

The whole-branch review's remaining findings are listed in
`.superpowers/sdd/2026-09-03-leash-frontend/progress.md`. The ones worth
knowing before touching the app:

- The onboarding wizard asks for an attribution tag with no link explaining
  how to get one, and does not validate its shape — so a mistyped tag yields a
  `.mcp.json` that looks complete and an MCP server that dies at startup.
- Six spec §4/§5 items were never built: address click-to-copy, relative
  timestamps on feed rows, and a QR code on the fund step among them. The
  network badge, the seventh, now exists.
- Spec §7 asks for a feed-formatting test covering "each custom error name".
  That is not buildable: a reverted transaction emits no logs, so `getLogs`
  can never surface one. Strike it from the spec rather than chase it.

## Decisions already made — do not re-litigate

- **ERC-1271 pre-authorization: skipped.** x402 goes via Path B. Reasoning in
  spec 2.1. Changing this means a fresh deployment; the contract is not upgradeable.
- **Celo's `buy` client: not used.** Leash signs with the operator key it has.
  The reason is independence and Path B integration, **not** fee attribution —
  the facilitator pays gas whichever client is used.
- **The standard `x402` npm packages cannot be used.** They support fifteen EVM
  networks and celo is not one. Leash ships its own client in `sdk/src/x402/`.
- **Task order for Plan 2 was "plan order", 1→9.** The demo-first alternative
  was dropped once the human partner chose to finish the product before filming.

## Decisions taken during Plan 3

- **Per-user deployment is a direct deploy from the frontend, not a factory.**
  `app/app/page.tsx` calls `deployContractAsync` with the bytecode copied into
  `app/lib/contract.ts` by `forge build`. Spec 2.1b laid out the trade.
- **`receive()` was removed rather than adding `sweepNative()`.** A native send
  to the account now reverts instead of being locked forever. This required
  the redeploy that produced `0x7aDa926B…3fd2`.

## Hazards this project paid to learn

- **A gas estimate is a reserve, not a price** — and with no gas limit set, the
  reserve is the **block** gas limit. Measured 2026-09-02: `blockGasLimit *
  gasPrice` = **0.465 USDC** against ~0.0022 actually spent, a 209x demand that
  leaves a low-balance operator unable to transact at all. **Always send an
  explicit `gas`** (`GAS_LIMIT` in `sdk/src/policyClient.ts`). An earlier note
  here said "roughly 3x"; that was wrong, and it mis-sized the x402 draw buffer.
- **A draw sized to the bare shortfall cannot pay.** The draw spends its own gas
  out of the balance it just topped up, landing below the amount already signed
  for. `payForResource` draws a buffer covering that gas *and* a working float.
- **forno is load-balanced and lies about freshness.** A receipt does not mean
  the state is readable. Wait on the condition, never on the receipt.
- **forno rejects fee-currency sends non-deterministically.** The same
  `maxFeePerGas` is refused by one node and accepted by the next. Retry,
  re-reading the nonce between attempts.
- **x402 has no refunds.** A `5xx` can mean the payment settled. Never retry
  blindly — but *do* read the chain first: on 2026-09-02 a `500` looked fatal
  and the balances proved nothing had settled, which made the retry safe. The
  rule is "never retry on a guess", not "never retry".
- **A poll URL from a purchase is a bearer capability.** Never commit or log one.
- **Celo produces one block per second, not one per five.** Measured
  2026-09-03: 10,000 blocks spanned exactly 10,000 seconds. The spec said ~5s,
  and the feed inherited it, so it scanned 14.4 hours while telling the reader
  it had covered three days. A block count on Celo *is* a second count.
- **forno refuses a `getLogs` range wider than 5,000 blocks.** 10,000 comes
  back "Invalid parameters were provided to the RPC method". Any history window
  is (window ÷ 5,000) sequential round trips, so a day costs 18 of them.
- **wagmi does not check which chain a write is signed on.** In @wagmi/core
  2.22.1 `writeContract` and `deployContract` call `getConnectorClient` with
  `assertChainId: false` and pass `chain: null` to viem unless an explicit
  `chainId` is given. Pass one on every write, always.
- **`local x=$(cmd)` swallows the exit status in bash.** `set -e` never fires.
- **The pre-commit guard only recognises a hash labelled `tx:` within 10
  characters.** Writing `Top-up tx (some clause): 0x…` trips it. Put the label
  next to the hash or use an explorer URL.

## Environment

`.env` exists and is filled in: owner, operator, attribution tag, deployed
account, celobuilders key, Celoscan key. It is gitignored and holds plaintext
private keys by the human partner's explicit choice.

A pre-commit guard (`scripts/check-secrets.sh`, wired via
`git config core.hooksPath .githooks`) blocks keys and mnemonics.
`core.hooksPath` is local config and is not cloned — a fresh clone must set it
again.

Money spent to date: roughly **$0.075** of gas plus **$0.034** of USDC on two
x402 purchases. The project holds 2.508783 USDC across its three addresses and
3.7582 CELO in the owner wallet.

## How this project is being executed

Plan 1 ran through `superpowers:subagent-driven-development`. Plan 2 ran inline
via `superpowers:executing-plans`, since the plans carry enough context that a
fresh agent adds little. Either works.

Plan 2's plan contained three defects that only surfaced against the real chain,
all found in the pre-flight checks before money moved. Budget for that: the
verification step before a gate is not ceremony.
