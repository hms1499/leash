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
2. `docs/deployments.md` — what is live, what it cost, and the proof for every claim.
3. `docs/mcp-setup.md` — the product surface, written for a stranger. Read it to
   see what a user actually receives.
4. `spikes/README.md` — every chain assumption that was tested, with evidence.
5. `.superpowers/sdd/2026-09-01-leash-foundation/progress.md` — the ledger.
   **Gitignored, lives only on this machine.** `git clean -fdx` would destroy it.

Plans 1 and 2 in `docs/superpowers/plans/` are both **done**; read them only for
context on decisions already taken.

## State: Plans 1 and 2 complete. Plan 3 is not written.

| Suite | Status |
|---|---|
| `cd contracts && forge test` | 30/30 |
| `cd sdk && pnpm run test` | 42/42 |
| `cd mcp && pnpm run test` | 12/12 |
| `tsc --noEmit` in `sdk`, `mcp`, `spikes` | exit 0 |

Gate tests are excluded from the ordinary runs. `pnpm -F @leash/sdk test:gate`
and `pnpm -F @leash/mcp test:gate` **spend real money** — see Hazards.

### Live on Celo mainnet

| | |
|---|---|
| `SpendPolicyAccount` | `0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` (source-verified) |
| Owner EOA | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` — 3.7582 CELO |
| Operator EOA (= registered `agentWalletAddress`) | `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6` — **0 CELO**, 0.012215 USDC |
| Attribution tag | `celo_3dec652cd977` |
| ERC-8004 identity | agentId 9804, owned by the operator |
| Policy | USDC: perTx 0.50, daily 1.00. `paused` false, allowlist off |
| Contract holds | 2.496567 USDC · `remainingToday` 0.980773 |

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

## Next: Plan 3 needs writing before any code

Nothing is blocked on chain work. The whole remaining product is the frontend
plus the two gaps below, and **the plan for it does not exist yet**. Write it
with `superpowers:writing-plans` before touching `app/`.

What it must cover, at minimum:

- **W5 from the spec** — Onboard, Live Spend Feed, Policy Editor. `T5.0` (design
  system) runs before any screen; `T5.2` runs before `T5.3` so there is always
  something filmable.
- **`pause()` has no UI.** The contract has a kill switch, tested and deployed,
  and the frontend design names no stop button. For a product whose whole claim
  is control, that is a hole.
- **The app hands nothing to the agent.** After onboarding a user has an account
  address and no way to connect it. Onboard should emit a ready-filled
  `.mcp.json` — that is the moment a viewer becomes a user. `docs/mcp-setup.md`
  is the content; the screen just has to fill in five values.
- **Two chain-level gaps found 2026-09-02, neither planned:**
  1. **CELO sent to the contract is locked forever.** `receive()` accepts it and
     `sweep()` only moves ERC-20 — there is no `call{value:}` anywhere. A user
     told to "fund your account" who sends CELO instead of USDC loses it. Fix by
     removing `receive()` (cheapest — the send then reverts) or adding
     `sweepNative()`. **Both need a redeploy**, so decide alongside 2.1b below,
     while the live instance is still only a demo.
  2. **Nothing refills the operator's gas float.** When its stablecoin runs out
     the agent stops, and it cannot draw more because drawing costs gas. Only
     the owner can rescue it. Any fix must go through the daily cap, not around it.
- **`examples/`** — the demo agent that spends and then gets blocked. `T6.1` in
  the spec; it is both the video script and what another team copies.

### Before filming

Top up the operator. It holds 0.012215 USDC, each transaction costs ~0.0028
and reserves ~0.0046, so that is **two or three transactions**. The demo needs
at least three consecutive `leash_pay` calls. 0.05 USDC is comfortable.

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

## Open decision for Plan 3

Per-user deployment: direct deploy from the frontend, or a factory contract.
Spec 2.1b lays out the trade. Decide before `T5.3`, not during — and settle the
`receive()` question in the same breath, since both decide what gets deployed.

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
