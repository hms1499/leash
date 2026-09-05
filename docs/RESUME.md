# Resume Here — Leash

Session paused 2026-09-05. This file is the entry point for the next session.
Read it before anything else, then read the documents it points at.

## What this project is

Leash gives an AI agent a wallet without trusting it. Funds sit in a contract,
not in the agent's wallet; the agent can only ask the contract to spend, and the
contract reverts past its limits. The limits are code on Celo, not a sentence in
a prompt, so a leaked agent key does not become an unbounded one.

- **Primary track:** `judges-favorite` · **Secondary:** `askbots-growth` (not entered yet)
- **Deadline:** 2026-09-14 09:00 GMT (16:00 ICT, Monday) — **9 days left**
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
| `cd mcp && pnpm run test` | 20/20 |
| `cd app && pnpm run test` | 138/138 |
| `cd app && pnpm run test:e2e` | 6/6 (Playwright, against a local build) |
| `tsc --noEmit` in `sdk`, `mcp`, `spikes`, `app`, `examples` | exit 0 |

Gate tests are excluded from the ordinary runs. `pnpm -F @leash/sdk test:gate`
and `pnpm -F @leash/mcp test:gate` **spend real money** — see Hazards.

### Live on Celo mainnet

| | |
|---|---|
| `SpendPolicyAccount` | `0x7aDa926B021BAef4896F51F237bCA61435E43fd2` (source-verified) |
| Test account (2026-09-04) | `0xA73DB76f20c5ede3ABE883565D22905760F83982` — deployed **through the wizard** by a real browser wallet, which is what proved the deploy path. Owner `0x94f7268ca8b29d536f8c5cd0753753d55Fb06459`, operator `0xd44daF…50D6`, perTx 0.50 / daily 1.00, holds **0.040000 USDC**, `remainingToday` 0.990000. **Left paused** by the 2026-09-05 wrong-network test; Resume it before using it again. Not project infrastructure; use it to exercise the UI, not as the demo account. |
| Superseded instance | `0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` — **do not use.** It accepted native CELO that could never be recovered; swept to 0 and replaced. See `docs/deployments.md`. |
| Owner EOA | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` — 3.5639 CELO |
| Operator EOA (= registered `agentWalletAddress`) | `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6` — **0 CELO**, 0.041078 USDC |
| Attribution tag | `celo_3dec652cd977` |
| ERC-8004 identity | agentId 9804, owned by the operator |
| Policy | USDC: perTx 0.50, daily 1.00. `paused` false, allowlist off |
| Contract holds | 2.436567 USDC · `remainingToday` 0.940000 — the demo ran twice |

Read back from mainnet on 2026-09-05. The figures above are the state, not a
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
- **The demo runs, end to end, on mainnet.** Twice on 2026-09-05, three
  spends of 0.01 USDC and then a refusal each time. `remainingToday` fell one
  step per spend across both runs, 1.000000 down to 0.940000, verified by
  reading each transaction's own block. The refusal
  (`PerTxCapExceeded(900000, 500000)`) sent nothing and cost nothing.
  First run — correct on-chain, wrong on screen; see the 2026-09-05 entry:
  tx: 0x57c4695071de9c039d4563912c271bebec3913b36849666f78efa12546bcddb9
  tx: 0xf78e028eb09b567d142fd3ee79cf18c4e4d54cb929c2f72dcddea8343f634c71
  tx: 0xe0330cbc91007fea355bb1ec20c990098c3b84d14edb58c20ebe4e757b6b2552
  Second run, after the fix — printed 0.96, 0.95, 0.94, each matching the
  chain at that transaction's own block:
  tx: 0xc79bb210dadee142a43cf1408a767665285ebf0cc7f99cb243e7696ae0e5a1e3
  tx: 0x2d915b730cb0a08486656213ce85532a72cf5371d209c99411b670ece19d1e7a
  tx: 0x2b364957bcc15dc68c085eb898fc12e13088fc64ba8bb5aefbd246cc8436aadf
- **A real MCP agent spent through the policy.** 2026-09-05, `leash_pay`
  called by a second Claude session with the Leash MCP server attached — no
  human typed an amount or a payee. Test account 0.050000 → 0.040000,
  `remainingToday` 1.000000 → 0.990000, payee +0.010000, `Spent` event data
  `0x2710`. Its first ever spend, so it also proved the dashboard learns the
  operator address from a real spend row rather than from `?operator=`.
  tx: 0x218d7f9516481a3c5747226cf2f90e73beaa4fde86e68c363e9259a66a244396
- **The live feed updates without a reload.** The three rows above appeared in
  the dashboard as they landed, watched by a human — the first real check of
  `e247872`, whose bug the backfill had been hiding.
- **x402 paid with money drawn through the policy.** Top-up `0xec08a200…33db`,
  settlement `0xb5dd4d16…1e25`. The daily counter fell by exactly the draw.
  This is the one that proves Path B; the bullet above does not.

## Next: everything left needs a human, a wallet, or both

The code is complete and reviewed. Nothing below is blocked on more building.

1. **Finish clicking every write path with a real wallet.** Started
   2026-09-04 with OKX on Celo, and it found four real defects in one sitting
   — three of them silent. See "What the wallet session found" below.

   | Path | |
   |---|---|
   | `deploy` (wizard) | done — and broken until `f682558` |
   | `setOperator` (wizard step 3) | done |
   | `setPolicy` (wizard step 4) | done |
   | `setPaused` — Stop | done |
   | `setPaused` — Resume | done |
   | Limits from the dashboard | **not yet** |
   | Refuel | done 2026-09-05 — `sweep`, tx: 0xb6a9ee9340561dbf56705a50b9cf9064abe78797b37fb0de561a76e518d2e3de |
   | Deliberate rejection in the wallet | done 2026-09-05 — nothing landed, no gas |
   | Deliberate wrong-chain attempt | done 2026-09-05 with Coinbase Wallet — found a defect, fixed, then passed |

   Do the two free ones first; they cost nothing and exercise error paths
   nobody has run.
2. **Deploy to Vercel** (`app/`), then run the smoke test against the
   production URL: `LEASH_E2E_URL=https://… pnpm -F @leash/app test:e2e`. Set
   `NEXT_PUBLIC_CELO_RPC_URL` there — otherwise every visitor shares public
   forno, and the dashboard makes 18 `getLogs` calls per load. Then replace
   the "A hosted URL will be added here" line in `README.md`.
3. **The demo is proven; what is left is the shoot.** It ran twice on
   2026-09-05 and the second run's output was checked figure by figure against
   the chain. `LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm -F @leash/examples demo`,
   roughly 0.03 USDC plus gas per take. Budget takes against the daily cap,
   not the balance: 1.00 USDC a day is about thirty runs, and it resets on
   `block.timestamp / 1 days`, i.e. at UTC midnight, not on any wall clock the
   shoot is keeping.
4. **Top up the operator before filming.** It holds 0.044505 USDC and 0 CELO;
   each transaction costs ~0.00286 and reserves ~0.0046, so that is about
   thirteen transactions — enough for four takes. Re-read it on the day rather
   than trusting this line, and refuel from the dashboard if it is low: that
   path is now proven.

### What the wallet session found (2026-09-04)

Four defects, in one sitting, none of which any review had caught. Three
failed silently. The write paths themselves were all correct — every bug was
in what the app told the person driving it.

- **A wallet that cannot estimate gas could not deploy at all** (`f682558`).
  OKX showed "Network fee estimation unsuccessful", a fee of `--`, and a
  Confirm that could not be pressed. The request reaching it carried only
  `data` and `from`: no `gas`, so a wallet whose own estimator comes back empty
  had nothing to fall back on. `CLAUDE.md` already said to always send an
  explicit gas and the SDK already did; `deploy()` was the path that did not.
- **The live feed never updated, and said nothing about it** (`e247872`).
  forno accepts `eth_newFilter`, so viem takes the filter path and never
  reaches its `getLogs` fallback; every `eth_getFilterChanges` then lands on a
  different node and answers "filter not found" (`-32602`, five polls in six).
  viem only rebuilds on `InvalidInputRpcError`, which that is not, and no
  `onError` was passed. The backfill hid it — a reload always looked right.
  **Assume nothing about `watchContractEvent` on a load-balanced RPC.**
- **The meter said what was allowed and never what was there** (`50778cd`).
  An account holding nothing read as a full allowance and offered a next spend
  that would revert. The caps are policy accounting and never look at the
  balance.
- **An account with an agent but no spends showed no agent** (`0478e44`).
  `operators` is not enumerable, and the dashboard learned the address only
  from a past spend or a hand-typed `?operator=`.

Also struck spec §4's landed-revert row (`879f514`), which contradicted its own
paragraph — see the entry below.

### What the second wallet session found (2026-09-05)

Refuel and the spend path were driven with a real wallet, and this time the
write paths and the UI were both correct. The one defect was in the demo.

- **Refuel is clean.** `sweep(USDC, operator, 0.05)` from the owner's browser
  wallet: account 0.100000 → 0.050000, agent 0.012215 → 0.062215, the panel
  moved 3 → 21 transactions and the button unmounted itself, and
  `remainingToday` stayed at 1.000000 — proving the owner's rescue path does
  not consume the agent's daily cap. No "not confirmed yet" note, so
  `pollUntil` observed the change inside its window.
- **The demo printed an allowance that had not moved** (fixed this session).
  Against three spends whose blocks held 0.99, 0.98 and 0.97, it printed
  **1, 1 and 0.98** — reads one to two blocks behind, with the receipt already
  in hand. `demo-agent.ts` read `remainingToday` immediately after
  `waitForTransactionReceipt`, and a comment in it argued that the receipt was
  what made the read safe. It is not: forno is load-balanced, and a receipt
  proves the transaction landed, never that the *next* node asked has seen
  that block.

  This matters more here than the same lag would anywhere else. The demo's
  whole claim is a counter falling by exactly what was spent; on camera it
  showed a counter sitting still. `remainingAtMost` now waits on the
  condition, with its ceiling anchored to a reading taken *before* any spend —
  a ceiling from a fresh read would itself be stale, and the lag would
  survive the fix. When it times out it says the figure is not readable yet
  rather than printing one nobody verified. The second run printed 0.96, 0.95
  and 0.94, each matching the chain at that transaction's own block — the fix
  is checked against the hazard itself, not only against a unit test.

  **The rule was already written down** — `CLAUDE.md`, "wait on the condition,
  not the receipt" — and every write path in `app/` obeyed it. `examples/`
  cannot import `app/lib/confirm.ts`, so it grew its own read, and the rule
  did not travel with it. Where a hazard is handled twice, check the second
  copy.
- **The live feed was verified by a human, finally.** Three `Spent` rows
  appeared without a reload. `e247872` holds against real traffic; the
  backfill was not what made it look right.
- **`leash_pay` reported four of its five refusals wrongly** (fixed this
  session). Found by driving the real MCP server from a second Claude session
  and reading the JSON an agent actually receives. An earlier note in this
  file called the underlying `spent: 0` "not a defect, but know it" — that was
  written from the SDK's raw output and was too soft. Through `payTool` it
  became labelled, plausible, wrong numbers.

  `PreCheckResult` has one `cap` field whose meaning changes with the error:
  the daily cap for `DailyCapExceeded`, the **per-transaction** cap for
  `PerTxCapExceeded`, zero for the rest. `pay.ts` labelled it `daily_cap`
  unconditionally and derived `remaining_today = cap - spent` from it. Against
  the test account (perTx 0.50, daily 1.00, nothing spent) a 0.90 request came
  back claiming a daily cap of 0.50 and 0.50 left for the day. Only
  `daily_cap_exceeded` was correct.

  The worst branch was the kill switch. With `cap = 0` the `remaining > 0n`
  test fell through to *"The allowance is exhausted. Wait for the reset at UTC
  midnight"* — so an owner pressing **Stop** told the agent to sleep until
  midnight and try again, against a switch a human threw on purpose.
  `not_an_operator` and `payee_not_allowed` said the same thing, and no amount
  of waiting clears either.

  Now: each error carries only figures its own revert supplied, the per-tx cap
  is named `per_tx_cap`, the day is read separately with `remainingToday()`
  (not derived from `limits()`, whose `spentToday` is stale once its `day`
  label is), the suggested ceiling is whichever bound bites first, and every
  non-cap refusal says who can clear it and that waiting will not. A failed
  read omits the field rather than guessing. Eight tests cover the branches,
  built from the SDK's own `describePreCheckFailure` so a change there fails
  here rather than reaching an agent.

  Third time this project has shipped a correct write path with a wrong
  account of it. **When a path can refuse, read what the refusal says, not
  just whether it refused.**

### The wrong-network test, and what it actually found (2026-09-05)

The guard was never the problem. **The message it prints was invisible.**

- **OKX keeps a per-site network and restores it on reload.** Changing chains
  in OKX's own UI left `eth_chainId` answering `0xa4ec`, and so did a reload
  after a successful `wallet_switchEthereumChain`. The badge reading `Celo`
  was reporting that honestly every time. Two apparent app bugs this session
  were this and nothing else, so: **read `eth_chainId` before concluding
  anything about the badge**, and never reload during the test.
- **A rejected transaction is reported as one.** Stop, confirm, then Reject
  in the wallet: the note read "The transaction was not sent.", and the chain
  agreed — `paused` still false and the operator's balance unchanged to the
  atomic unit, so nothing was broadcast and no gas was spent. The branch that
  matters is the one it did *not* take: "Sent, but the chain has not confirmed
  it yet" would have told an owner their kill switch might have worked while
  they were the one who cancelled it.
- **The guard passes — verified with Coinbase Wallet, not OKX.** Coinbase
  switches networks globally rather than per site, so the page stays on the
  wrong chain long enough for the guard to matter. Observed: the badge turned
  red, the warning was legible on the paused band (which is the human check on
  the fix above), and **the wallet never opened**. That last point is the
  whole claim — the guard refuses before touching the wallet, rather than
  leaving a person to cancel a prompt.

  **Use a wallet whose network is global for this test.** With OKX the page
  never stays on the wrong chain, and the badge and the guard read the same
  `useAccount().chainId`, so clicking while the badge is still green tests
  nothing at all.
- **`--bad` on `--bad`, a contrast ratio of exactly 1.00** (fixed). `page.tsx`
  swaps the header's ground to `--bad` when the account is paused. The
  "Wrong network — switch to Celo" badge is the `stop` button variant, `--bad`
  on transparent; `StopButton`'s note is `--bad` too. So on a paused account
  the warning and the control that fixes it were both drawn in the background
  colour. Not hard to read — not visible. An owner sees a Resume button that
  appears to do nothing and no reason why, which is the worst possible moment
  for the UI to go quiet: the account is stopped and they are trying to
  recover it.

  Both now use `--bg` on that band, 5.10:1, the same dark-on-bright treatment
  the primary button uses on Celo yellow.
- **The contrast test could not have caught it.** Its `grounds` list was
  `['bg', 'panel']`, and the paused band is neither. It is now covered as the
  third ground it has always been, asserting what actually renders there
  rather than every token — `--text` on that band is 3.16 and clears UI
  contrast but not body, which is a known limit of the band, not an oversight.
- **Still to confirm:** whether the guard fires reliably *at the moment of the
  click*. A Stop sent at 09:41:17 reached the wallet while the page had just
  been switched to Ethereum, which would mean wagmi had not yet processed
  `chainChanged`; a later Resume did print the warning. With the message now
  visible the retest is unambiguous and costs nothing.

### Known and deliberately unfixed

The whole-branch review's remaining findings are listed in
`.superpowers/sdd/2026-09-03-leash-frontend/progress.md`. The ones worth
knowing before touching the app:

- The onboarding wizard asks for an attribution tag with no link explaining
  how to get one, and does not validate its shape — so a mistyped tag yields a
  `.mcp.json` that looks complete and an MCP server that dies at startup.
- Of the seven spec §4/§5 items once listed here, three now exist: the network
  badge, address click-to-copy (`42a84b5`), and relative timestamps on feed
  rows (`9b80f5f`). Four remain unbuilt, a QR code on the fund step among them.
- **Landed reverts are not in the feed and will not be.** A reverted
  transaction emits no logs, so `getLogs` can never surface one. Spec §7 asked
  for a test of it (struck 2026-09-03) and spec §4 asked for the row itself
  (struck 2026-09-04) — the second was missed the first time round, and §4's
  own sentence contradicted its own paragraph. Both are struck in place with
  the reasoning, and `describeLog` carries a comment so nobody re-derives it
  from an older revision. Surfacing them would mean scanning every transaction
  sent to the account — 86,400 blocks a day, not a client-side job — hence an
  explorer API and a backend route that §1 deliberately does not have. Celoscan
  V1 is retired and Etherscan V2's free tier rate-limits, both measured
  2026-09-04. A revert caused deliberately as evidence belongs in
  `app/lib/proofs.ts`, which already renders on the landing page.

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

Money spent to date: roughly **$0.102** of gas plus **$0.034** of USDC on two
x402 purchases. The project holds 2.587646 USDC across its four addresses —
account 2.436567, test account 0.040000, operator 0.041078, owner 0.070001 —
and 3.5639 CELO in the owner wallet. The rise since 2026-09-04 is 0.10 USDC
sent in from the browser wallet `0x94f7…6459` to fund the refuel test; the
demo's 0.03 moved from the account to the payee, which is the owner EOA, so
it never left the project.

## How this project is being executed

Plan 1 ran through `superpowers:subagent-driven-development`. Plan 2 ran inline
via `superpowers:executing-plans`, since the plans carry enough context that a
fresh agent adds little. Either works.

Plan 2's plan contained three defects that only surfaced against the real chain,
all found in the pre-flight checks before money moved. Budget for that: the
verification step before a gate is not ceremony.
