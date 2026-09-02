# Resume Here — Leash

Session paused 2026-09-02. This file is the entry point for the next session.
Read it before anything else, then read the documents it points at.

## What this project is

Leash gives an AI agent a wallet without trusting it. Funds sit in a contract,
not in the agent's wallet; the agent can only ask the contract to spend, and the
contract reverts past its limits. The limits are code on Celo, not a sentence in
a prompt, so a leaked agent key does not become an unbounded one.

- **Primary track:** `judges-favorite` · **Secondary:** `askbots-growth` (not entered yet)
- **Deadline:** 2026-09-14 09:00 GMT (16:00 ICT, Monday) — **12 days left**
- **Repo:** https://github.com/hms1499/leash (public)

## Read these, in order

1. `docs/superpowers/specs/2026-09-01-leash-design.md` — the design. Binding authority.
2. `docs/superpowers/plans/2026-09-02-leash-x402-mcp.md` — **Plan 2, not started.** Next work.
3. `docs/registration.md` and `docs/deployments.md` — what is live and what it cost.
4. `spikes/README.md` — every chain assumption that was tested, with evidence.
5. `.superpowers/sdd/2026-09-01-leash-foundation/progress.md` — the ledger.
   **Gitignored, lives only on this machine.** `git clean -fdx` would destroy it.

## State: Plan 1 complete, Plan 2 written and not started

| Suite | Status |
|---|---|
| `cd contracts && forge test` | 30/30 |
| `cd sdk && pnpm run test` | 11/11 |
| `cd sdk && pnpm exec tsc --noEmit` | exit 0 |
| `cd spikes && pnpm exec tsc --noEmit` | exit 0 |

### Live on Celo mainnet

| | |
|---|---|
| `SpendPolicyAccount` | `0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` (source-verified) |
| Owner EOA | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` — 3.758 CELO |
| Operator EOA (= registered `agentWalletAddress`) | `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6` — **0 CELO**, 1.030794 USDC |
| Attribution tag | `celo_3dec652cd977` |
| ERC-8004 identity | agentId 9804, owned by the operator |
| Policy | USDC: perTx 0.50, daily 1.00. Contract holds 1.499999 USDC |

### Proven on mainnet, not asserted

- **Zero-CELO gas.** The operator holds exactly 0 CELO and still transacts,
  paying in USDC. `0x1d10d9cb…6595`.
- **Attribution round-trips.** `0xb91ba357…fca4`, decoded off-chain and again
  straight from raw chain data.
- **The policy actually gates a spend.** Gate test `0x3fb0324f…1f70`:
  `remainingToday` fell by exactly the amount spent.
- **A real x402 purchase.** `0x0ac87832…b46e` — 0.016753 USDC for a Google Cloud
  `e2-micro` that ran a script and returned its output.

## Next: Plan 2 (x402 + MCP), nine tasks

`docs/superpowers/plans/2026-09-02-leash-x402-mcp.md`. Tasks 1-5 build a
Celo-specific x402 client in the SDK and the Path B draw; Tasks 6-8 are the MCP
server; Task 9 is a mainnet gate plus setup docs.

**An ordering question was left open when the session ended.** The demo needs an
agent visibly spending, which needs the MCP server. Two routes:

- **Plan order** — Tasks 1-9 as written. `leash_fetch` works when it ships.
- **Demo-first** — build `leash_status` and `leash_pay` before the x402 client.
  Both need only the deployed contract, so the "agent is refused by the chain"
  beat becomes filmable immediately, and `leash_fetch` lands after.

## Two gaps found late, neither yet planned

1. **`pause()` has no UI.** The contract has a kill switch, tested and deployed.
   The frontend design names three screens and none of them is a stop button.
   For a product whose whole claim is control, that is a hole.
2. **The app hands nothing to the agent.** After onboarding, a user has an
   account address and no way to connect it. The Onboard screen should emit a
   ready-filled `.mcp.json` — that is the moment a viewer becomes a user.

Both belong in Plan 3, which is not written.

## Decisions already made — do not re-litigate

- **ERC-1271 pre-authorization: skipped.** x402 goes via Path B. Reasoning in
  spec 2.1. Changing this means a fresh deployment; the contract is not upgradeable.
- **Celo's `buy` client: not used.** Leash signs with the operator key it has.
  Note the reason is independence and Path B integration, **not** fee
  attribution — the facilitator pays gas whichever client is used.
- **The standard `x402` npm packages cannot be used.** They support fifteen EVM
  networks and celo is not one. Leash ships its own client.

## Open decision for Plan 3

Per-user deployment: direct deploy from the frontend, or a factory contract.
Spec 2.1b lays out the trade. Decide before `T5.3`, not during.

## Hazards this session paid to learn

- **forno is load-balanced and lies about freshness.** A receipt does not mean
  the state is readable. Four separate failures came from reading immediately
  after writing. Wait on the condition, never on the receipt.
- **forno rejects fee-currency sends non-deterministically.** The same
  `maxFeePerGas` is refused by one node and accepted by the next. This looked
  like a threshold until retrying the same values inverted the result. Retry,
  re-reading the nonce between attempts.
- **A gas estimate is a reserve, not a price** — and with no gas limit set,
  the reserve is the **block** gas limit. Measured on mainnet 2026-09-02:
  `blockGasLimit * gasPrice` = **0.465 USDC** against ~0.0022 actually spent,
  a 209x demand that makes a low-balance operator unable to transact at all.
  Always send an explicit `gas`. (An earlier note here said "roughly 3x"; that
  was wrong, and it is what mis-sized the x402 draw buffer.)
- **`local x=$(cmd)` swallows the exit status in bash.** `set -e` never fires.
- **x402 has no refunds.** A `5xx` can mean the payment settled. Never retry.
- **A poll URL from a purchase is a bearer capability.** Never commit or log one.

## Environment

`.env` exists and is filled in: owner, operator, attribution tag, deployed
account, celobuilders key, Celoscan key. It is gitignored and holds plaintext
private keys by the human partner's explicit choice.

A pre-commit guard (`scripts/check-secrets.sh`, wired via
`git config core.hooksPath .githooks`) blocks keys and mnemonics. It blocked
three commits this session: twice as a false positive that was fixed at the
source, once correctly. `core.hooksPath` is local config and is not cloned — a
fresh clone must set it again.

Money spent to date: roughly **$0.07** of gas plus **$0.017** of USDC. The owner
holds 3.758 CELO (about $0.28) and the project holds 2.53 USDC.

## How this plan is being executed

Plan 1 ran through `superpowers:subagent-driven-development`. This session ran
inline via `superpowers:executing-plans`, since the plans carry enough context
that a fresh agent adds little. Either works. The ledger is the recovery map.
