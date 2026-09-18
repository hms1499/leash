# Resume Here — Leash

Session paused 2026-09-07. This file is the entry point for the next session.
Read it before anything else, then read the documents it points at.

## What this project is

Leash gives an AI agent a wallet without trusting it. Funds sit in a contract,
not in the agent's wallet; the agent can only ask the contract to spend, and the
contract reverts past its limits. The limits are code on Celo, not a sentence in
a prompt, so a leaked agent key does not become an unbounded one.

- **Submission is PUBLISHED**, 2026-09-06 03:10 UTC, and was **updated for v2
  on 2026-09-14**. Both read back from `GET /submissions/me` as
  `status: published`, not inferred from the PUT. It stays editable until the
  deadline, so a video or a fix still lands.
- **Primary track:** `judges-favorite` · **Tracks:** also `value-moved` and
  `real-world-adoption` · **Bounties:** `judges-favorite`,
  `best-stablecoin-adoption`, `value-moved-1st`, `value-moved-2nd`,
  `best-real-world-adoption`. `askbots-growth` was never entered.
  `docs/registration.md` is the record; this line has been wrong before.
- **Deadline:** 2026-09-21 09:00 GMT (16:00 ICT, Monday). **Extended from
  14 Sep**, which is what this line said until 2026-09-14 — a date written here
  from the spec and never re-read against `GET /hackathons/agents-at-work`.
  **No countdown is written here.** The one that was here said "8 days left"
  and was still saying it on 2026-09-12, when two remained. Subtract from the
  date, and re-read the date from the API.
- **Repo:** https://github.com/hms1499/leash (public)

## Read these, in order

1. `docs/superpowers/specs/2026-09-01-leash-design.md` — the design. Binding authority.
2. `docs/deployments.md` — what is live, what it cost, and the proof for every claim.
3. `docs/mcp-setup.md` — the product surface, written for a stranger. Read it to
   see what a user actually receives.
3a. `docs/design-system.md` — the interface's rules and the measurements behind
   them. Read it before changing anything in `app/`. It supersedes spec §4.1.
4. `spikes/README.md` — every chain assumption that was tested, with evidence.
5. `.superpowers/sdd/2026-09-03-leash-frontend/progress.md` — the current
   ledger, including the whole-branch review and what it found.
   `.superpowers/sdd/2026-09-01-leash-foundation/progress.md` is the earlier one.
   **Both gitignored, living only on this machine.** `git clean -fdx` would
   destroy them.

The plans in `docs/superpowers/plans/` are context on decisions already taken.
Both 2026-09-17 plans closed that day, manual browser passes included:
`leash-wallet-session.md` and `leash-setup-resume.md`.

**No count of that directory is written here any more.** This sentence carried
one for three revisions and was wrong in two of them: it said "three" while five
files sat there, was corrected to five, and was still saying five once the npm
plan made six. A number written beside a directory goes stale the next time
somebody adds a file to it. `ls docs/superpowers/plans/`, and read the
checkboxes in the file rather than a summary of them.

## State: all six plans complete, and v2 is deployed and re-proved on mainnet.

v2 makes the owner movable (`transferOwnership` nominates, `acceptOwnership`
completes) and puts `topUpOperator` behind an owner switch that is off at
construction. The contract is not upgradeable, so that meant a fresh deployment:
**`0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d`**, which is what every fixture,
test, e2e spec and README link now points at. Every proof earned on v1 was
re-earned against it rather than carried over. The work lives on
`feat/v2-ownership-topup`; where that branch has got to is a question for
`git log`, not for this line — this file has asserted a wrong push state four
times.

| Suite | Status |
|---|---|
| `cd contracts && forge test` | 66/66 |
| `cd sdk && pnpm run test` | 101/101, re-run 2026-09-18 (was 83; `constants.test.ts` pins the Celo mainnet defaults and the project's attribution code, and `attribution.test.ts` covers a multi-code suffix) |
| `cd mcp && pnpm run test` | 51/51, re-run 2026-09-18 (was 35; the `SPEND_TOKEN`/`FEE_ADAPTER`/`ATTRIBUTION_TAG` defaults, the two-code suffix, and the note `leash_status` prints when the default token has no policy) |
| `cd mcp && pnpm run test:bundle` | 3/3, re-run 2026-09-18 (packs the tarball, installs it, starts the bin — now on **two** env vars, which also proves the defaults were inlined) |
| `cd app && pnpm run test` | 481/481, re-run 2026-09-18 (was 500 on 2026-09-17; the emitted block went from five variables to two, taking `displayTag`/`isAttributionTag` and their 19 tests with it — the bug they guarded cannot occur in a block that carries no tag) |
| `cd app && pnpm run test:e2e` | 41/41 local, re-run 2026-09-18 **and** 41/41 against <https://leash-app-phi.vercel.app> with `LEASH_E2E_URL`. The deployed run was 40/41 until the redeploy: `landing.spec.ts` asserts the landing links to the v2 account and the build then serving that URL still carried v1's. That failure was the deploy signal, and it cleared the moment the deploy landed. |
| `tsc --noEmit` in `sdk`, `mcp`, `spikes`, `app`, `examples` | exit 0 |

Every row above except `test:bundle` was re-run on **2026-09-13** and is that
run's output, not a recollection; the `app` unit row is its **2026-09-17** run,
after the wallet-session and setup-resume work moved it from 362 to 500. The
e2e row's 41/41 was re-run that day too, on the build Playwright starts itself. These counts have rotted twice now. On
2026-09-12 sdk was written 66 against 75, app 232 against 338, and e2e 13
against 41; the same evening v2 Tasks 1-9 moved contracts 32 to 66, sdk 75 to
78, mcp 29 to 31 and app 338 to 353; and the three defects that mainnet found
during Task 12 moved sdk to 83, mcp to 35 and app to 362 while these lines still
said otherwise. A suite count is a figure like any other: run it rather than
copying the line above it.

The app's `/accounts` route discovers direct contract deployments through the
Etherscan V2 Celo index (`chainid=42220`), then verifies the owner and complete
read interface used by the dashboard over Celo RPC before caching or displaying a result. Set
`CELOSCAN_KEY` in the app's server environment; it must not use a
`NEXT_PUBLIC_` prefix.

**Merged and pushed 2026-09-07.** `feat/npm-distribution` went onto `main` by
fast-forward — `main` was a strict ancestor, so no merge commit and no rewritten
history — and `d7d9921..f9b9506` reached the remote: 16 commits, five of which
predated the npm work.

Everything through that merge is on the remote, and the docs commit describing
it went up too.

**No ref hashes are written here any more.** This file has asserted a wrong
push state four separate times, and each correction was itself a commit that
made the table it had just fixed stale again -- a snapshot of "how far ahead is
local" cannot survive the act of recording it. Ask git instead, which is the
only answer that is true when you read it rather than when it was typed:

```bash
git rev-parse main origin/main      # two identical hashes = nothing pending
git log --oneline origin/main..main # empty = nothing pending
git ls-remote --heads origin main   # what GitHub holds, not a local cache
```

The first line carried `--short` until 2026-09-17 and could never have run:
`--short` implies `--verify`, which takes exactly one revision, so the command
this file offered as the way to check answered `fatal: Needed a single
revision` every time. It reads like a broken remote ref and is not one. The
third line is the only one of the three that asks GitHub rather than
`refs/remotes/origin/main`, which is a cache updated by fetch and push.

Gate tests are excluded from the ordinary runs. `pnpm -F @leash/sdk test:gate`
and `pnpm -F leash-agentpay test:gate` **spend real money** — see Hazards.

## The MCP server is on npm, and an agent has now used it

`leash-agentpay@0.2.1` is **published, public, and walked from the registry**
as of 2026-09-07: cold cache, empty directory, bin started by name,
`leash_status` and two `leash_fetch` quotes against the live gateway. Repeat it
with `pnpm -F leash-agentpay verify:published <version>` (costs nothing).

**The registry's `latest` is `0.3.1`**, read 2026-09-12 with `npm view
leash-agentpay version`. Every version number in the proofs below names the
build that was actually walked or spent through — do not renumber them to
match the registry, or the proof stops being about anything that happened.

**`leash_pay` was proven on mainnet the same day**, through the published
package: a real 0.01 USDC payment, `ok: true` returned only after 7.4s of
waiting for the chain, and the allowance, the account and the payee each moved
by exactly 10000 read at that transaction's own block.
`pnpm -F leash-agentpay prove:pay` repeats it — **it spends real money**, so it
is guarded by `LEASH_PROVE_SPEND_REAL_MONEY=yes` like the demo.
tx: 0x0786b9796e73feee95e3ce5e19a1ad0b63559512bbbace3ee3e165be11628b21

**That payment landed on v1**, read back off forno on 2026-09-16: status `1`,
`Spent` of exactly 10000, `to` = `0x7aDa926B…3fd2`. The record stands — it is
what proved the tool waits for the chain — but it is not evidence about the
live account, and `app/test/proofs.test.ts` now refuses it by name. The v2
equivalent, an agent given the account and nothing else, is
tx: 0x3cb307a4fde990a3f9282348999127daf022f4caea264af16426595158148704

Its other two outcomes, `spend_reverted` and `sent_unconfirmed`, are covered by
unit tests and have **not** been observed on-chain. Both need a chain that
misbehaves on cue. Do not claim them.

The 0.1.0 record, which still stands as written: it was **published, public,
and exercised end to end.** A
second account was deployed through the hosted wizard on 2026-09-07, and an
agent running `npx -y leash-agentpay` — the published package, started by its
own MCP client from the `.mcp.json` the wizard emitted at the time (emission
was removed and restored on 2026-09-09; see below) — called `leash_status`
against it, then `leash_fetch` with `quote_only: true` against
`https://usebuy.ai/gcloud/vm` for a quote of 0.016753 USDC.

That is the same `16753` the settled purchase cost months earlier: same
endpoint, same price, this time reached through the registry rather than a
checkout. `leash_fetch` is the load-bearing one — its `@leash/sdk` import is
dynamic and lives inside that tool's branch alone, so a bundle that left it
external would serve the other two tools perfectly and die only there. Full
record, and the two limits on the measurement, in `docs/deployments.md`.

Its plan and spec:

- `docs/superpowers/specs/2026-09-06-leash-npm-distribution-design.md`
- `docs/superpowers/plans/2026-09-06-leash-npm-distribution.md`
- Execution ledger, **gitignored, only on this machine**:
  `.superpowers/sdd/2026-09-06-leash-npm-distribution/progress.md`. It holds
  every ruling made during execution. `git clean -fdx` destroys it.

**All six tasks are done**, with one piece of Task 6 deliberately left open.
The whole-branch review was read and its one finding fixed (`CLAUDE.md` still
claimed 191 app tests against an actual 193, and listed no `test:bundle`); both
minors parked during task reviews were closed at the same time.

**CI has run.** Three jobs green on the first execution in the project's life:
`bundle` 43s, `packages` 1m9s, `contracts` 16s —
<https://github.com/hms1499/leash/actions/runs/34072306485>.

## 2026-09-09 — an app flow audit, and eleven of its fifteen tasks

Two passes over `app/`: a manual full-flow read and a `/code-review app/
--effort high` agent. Fifteen defects, planned in
`docs/superpowers/plans/2026-09-09-leash-app-flow-fixes.md`, which carries each
defect statement inline.

**Done (12).** In commit order: the deploy receipt (a reverted creation was
saved as an account and the next failed read blamed on the network); the feed
tail cursor (a background tab reported a quiet account over blocks nobody
scanned); account discovery (a rate-limited RPC told an owner they had no
accounts); the funding pre-check; explicit gas on all fourteen writes; the
payee allowlist (a "ready to spend" badge over payments the contract refuses);
the truncating limits pre-fill (an untouched Save lowered the cap, and a
sub-cent cap blanked the wizard); browser storage (a throw reported confirmed
transactions as never sent); the refuel plan; four small rule breaks (a
blinking error banner, a meter animating in a hidden tab, money without
`.num`, two type sizes off the scale); the Finder duplicates, one of which
would have doubled CI; and Task 9, listing every verified operator rather than
the newest.

**Deliberately not done (3).** Task 14's ABI consolidation is a refactor
against a non-upgradeable contract, and `app/lib/contract.ts` holds the deploy
bytecode; it does not belong before a filmed first run. Task 14's dead exports
(`forgetPolicyAccount`, `shortHash`, `AccountsPage`'s unused `refresh`) and the
question of whether `PROOFS[1]` and `PROOFS[3]` should be rendered or dropped
are still open — dropping two changes a claim, not just code.

**No task touched the contract.** `SpendPolicyAccount.sol` is unchanged, so
there is no redeploy and no new address, and `app/lib/contract.ts` still holds
the bytecode that is source-verified on Celoscan. An account deployed through
the wizard today is byte-identical to `0x7aDa926B…3fd2`.

*Superseded 2026-09-12.* True of that audit and false now: v2 changed the
contract, redeployed it to `0xBE380aa7…11C3d`, and regenerated
`app/lib/contract.ts`. The wizard now deploys v2. See **Live on Celo mainnet**.

**The two fixes the node-only suite cannot reach were verified in a browser on
2026-09-09**, against `pnpm dev` and live forno, and each was checked BOTH ways
-- with the fix, and with only that fix reverted -- so the probe is known to be
capable of failing.

*Task 4, the feed cursor.* Chrome with `document.hidden` forced true from before
first paint, `eth_getLogs` ranges recorded off `window.fetch`. Fixed: backfill
ended at block 77022196, nothing was requested during 20 hidden seconds, and the
first tail range after focus was 77022197-77022224 -- **0 blocks unscanned**.
With `lastSeen = head` removed from the backfill and nothing else changed: the
backfill ended at 77022364 and the first tail range began at 77022390 --
**25 blocks queried by nothing**, which is what the feed used to call a quiet
account.

*Task 5, the storage guards.* `localStorage` replaced before first paint with an
object whose every accessor throws `SecurityError`, as Safari private mode does.
Fixed: `/a/<address>` resolved the agent panel to AUTHORIZED with the real
operator, `/setup` rendered step 1, `/accounts` rendered its connect prompt, and
there were zero unhandled rejections. With `readLocal` reverted to a raw
`getItem` and the `.catch` removed from `void resolve()`: the panel sat on
"Checking operator access on chain..." for the full 25-second observation, the
overview sat on "Verifying agent access", no operator was ever shown, and three
unhandled SecurityErrors reached the page.

Both probes ran against the demo account, which had no activity inside the
24-hour window, so they prove the SCAN RANGE and the render path rather than
row rendering. A spend landing live in the feed is still worth watching once
during the shoot.

Gas figures for Task 12 were measured with `cast estimate` on mainnet that day
and are recorded in `app/lib/chain.ts`, along with why each constant is roughly
double its measurement: those estimates come from an account already in use,
and warm storage understates a fresh one by ~17,000 gas per cold slot. A
first-run wizard is the case they have to cover.

### Pick up here

1. **Nobody has timed the walk.** Task 6 proved the path works; it did not
   measure it. No duration is claimed in `README.md` or `docs/deployments.md`,
   and none should be until somebody walks it with a clock running. The walk
   also reused the registered operator EOA rather than generating one, so even
   a timed repeat would understate a stranger's cost by that step.
2. **Two of the three deferred items shipped in v2 on 2026-09-12**: the
   ownership transfer path (two-step `transferOwnership`/`acceptOwnership`, both
   branches exercised by a real second wallet on mainnet) and the owner switch
   that disables `topUpOperator`. **The factory is still deferred** — account
   addresses are not deterministic and the frontend still carries the deploy
   bytecode. `/accounts` finds accounts by scanning direct deployments from the
   owner EOA, and behind a factory the deployer is the factory, so discovery
   would have to be rewritten first.
3. **The GitHub Actions annotation is cosmetic, for now.** Every job warns that
   `actions/checkout@v4`, `actions/setup-node@v4` and `pnpm/action-setup@v4`
   target the deprecated Node 20 *action runtime*. That is not the project's
   `node-version: 20`, which is correct and must stay. Bumping those three to
   `@v5` clears it.

### What the branch changed for a user

The `.mcp.json` a reader copies now says `npx -y leash-agentpay` instead of
`/absolute/path/to/leash/mcp/src/index.ts`, which they had to edit by hand.

**Deleted, then restored, both on 2026-09-09.** For part of that day the app
rendered the block nowhere: `McpHandoff.tsx`, `lib/mcpJson.ts` and their 24
tests were deleted as a builder nothing built, and `docs/mcp-setup.md` was the
only copy. It is back on `/setup` stage 4 only, because a stranger who finished
all four steps was left with an account and no way to connect an agent to it.

What changed on the way back: the `tagStatus` prop is gone. The component
derives it from `isAttributionTag`, since a caller-supplied status is exactly
what let the landing page and `/setup` disagree about one block (see the
2026-09-05 entry below). `FEE_ADAPTER` is declared in `lib/mcpJson.ts` and
pinned by a test -- it had vanished from `app/` entirely with the deletion.

**Amended 2026-09-18:** neither of those sentences survives. `FEE_ADAPTER` and
the USDC token live in `sdk/src/constants.ts` now, as `CELO_USDC_FEE_ADAPTER`
and `CELO_USDC`, pinned by `sdk/test/constants.test.ts`; 0.4.0 defaults to them,
and the same two constants replaced the four hand-copied USDC literals in
`app/`. Then 0.5.0 took `ATTRIBUTION_TAG` too — the server emits
`LEASH_ATTRIBUTION_CODE` because the code represents the app that built the
transaction, which is the server and not its user. **The emitted block is down
to two variables, `LEASH_ACCOUNT` and `OPERATOR_PK`,** and `McpHandoff`'s tag
field went with it, along with `displayTag`, `isAttributionTag` and the 19 tests
that guarded a bug a tagless block cannot have.

It is on the dashboard too, since 2026-09-09: an owner who did not save the
block had nowhere to read it again. `/a/[address]` renders it inside
`#agent-management`, shut by default, gated on `isOwner` -- which is
`canEdit(state.owner, connected)`, `owner()` read off the chain, never
`?operator=`. Both callers pass an `operator` they have verified against
`operators()`, so the OPERATOR_PK warning can name which wallet's key it means;
an account can hold several operators, which is what d1405ba was about.

The e2e assertions did NOT need changing and were not changed: `landing.spec.ts:9`
loads `/setup` with no wallet, which is stage 1, `:59` is the landing page, and
all four dashboard tests run with no wallet, so `isOwner` is false there. Every
one still passes.

The sentence this paragraph used to end with -- "the landing page and `/setup`
both render through it, so they cannot drift apart" -- was false when it was
written and is still false: only `/setup` renders it now.

**`@leash/sdk` is deliberately not published**, and is a `devDependency` rather
than a dependency, because `@leash/sdk` on the registry is an unrelated
project — leaving it a real dependency would have made every user's install
fetch a stranger's code. Do not "fix" that back.

### Live on Celo mainnet

| | |
|---|---|
| `SpendPolicyAccount` (v2) | `0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d` (source-verified — `forge verify-check` returned `Pass - Verified`, not inferred from the submission's `OK`). Deployed 2026-09-12 **through the wizard**, which is where a stale-bytecode bug would hide. `owner` is a storage slot, `pendingOwner()` answers instead of reverting, and `topUpEnabled` was flipped **true** on 2026-09-12 to prove the x402 draw. |
| Test account (2026-09-04) | `0xA73DB76f20c5ede3ABE883565D22905760F83982` — deployed **through the wizard** by a real browser wallet, which is what proved the deploy path. Owner `0x94f7268ca8b29d536f8c5cd0753753d55Fb06459`, operator `0xd44daF…50D6`, perTx 0.50 / daily 1.00, holds **0.000000 USDC**, `remainingToday` 1.000000, and is **`paused` true again** — read 2026-09-12 at block 77278716. It was resumed on 2026-09-05 and something has stopped it since; the dated note further down saying it is not paused was true when written and is not now. Not project infrastructure; use it to exercise the UI, not as the demo account. |
| Superseded instance (v1) | `0x7aDa926B021BAef4896F51F237bCA61435E43fd2` — **do not use.** Replaced by v2 on 2026-09-12 because the owner was `immutable` and `topUpOperator` had no off switch, and the contract is not upgradeable. Held 0.000000 USDC at the time, so no funds had to move. See `docs/deployments.md`. |
| Superseded instance | `0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` — **do not use.** It accepted native CELO that could never be recovered; swept to 0 and replaced. See `docs/deployments.md`. |
| First v2 attempt | `0x7156af4f9552a77736ad77772b46fd4d3c3c5e07` — **do not use.** The wizard was started from the main checkout, whose `app/lib/contract.ts` still carried v1 bytecode, so this is a v1 contract. Swept to 0 and abandoned. |
| Owner EOA | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` — 3.5367 CELO, 0.200000 USDC, read 2026-09-12 at block 77278716 |
| Operator EOA (= registered `agentWalletAddress`) | `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6` — **0 CELO**, 0.037776 USDC, read 2026-09-12 at block 77278716 |
| Attribution tag | `celo_3dec652cd977` |
| ERC-8004 identity | agentId 9804, owned by the operator |
| Policy | USDC: perTx 0.50, daily 1.00. `paused` false, allowlist off |
| Contract holds | **0.000000 USDC** · `remainingToday` 1.000000 — read 2026-09-12 at block 77278716. The 0.190000 recorded on 2026-09-07 was swept to the owner EOA on 2026-09-11, tx: 0x62a21d2838448b8938677b480e5f9041ce183aecb4aeeeaf92f11c566778aa39 — so the money is in the project, not lost, but **the demo account cannot spend anything today.** The policy is not the blocker: `paused` is false and the full day's allowance is intact. **Fund it before filming** — ~0.03 USDC a take. |

Every row above carries the date it was read. Those figures are the state at
that date, not a recollection of it — and a row not dated today is a row nobody
has checked today.

### Proven on mainnet, not asserted

**Read this list as a dated log, not as the current evidence.** Every bullet
below was earned before v2 existed, and several landed on deployments that are
now superseded — the policy-gated spend on `0x895B773E…`, the `leash_pay`
proof on v1 `0x7aDa926B…`, the MCP-agent spend on `0xA73DB76f…`, which is
somebody else's account. They are true records of what happened on the day
they say, and they are not what the product should cite.

What the product cites lives in `app/lib/proofs.ts`, refreshed 2026-09-16 to
the v2 set recorded under "What v2 was proved to do" in `docs/deployments.md`.
`app/test/proofs.test.ts` now fails if any hash below reappears there. Nothing
in this section was rewritten to match: a log that edits its own past stops
being evidence of anything.

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
- **`leash_pay` waits for the chain before it says "paid".** 2026-09-07,
  through `leash-agentpay@0.2.1` installed from npm: `ok: true` came back only
  after 7.4 seconds, and the allowance, the account and the payee each moved by
  exactly 10000 read at that transaction's own block. Before this release the
  tool answered instantly, because it waited for nothing.
  tx: 0x0786b9796e73feee95e3ce5e19a1ad0b63559512bbbace3ee3e165be11628b21
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

   Only **limits from the dashboard** is left, and it costs gas. The two free
   error paths are both done and both passed — see the 2026-09-05 entries.
2. **Deployed. <https://leash-app-phi.vercel.app>** — Vercel project
   `hms1499s-projects/leash-app`, root directory `app`, production READY since
   2026-09-05 21:46 ICT. `NEXT_PUBLIC_CELO_RPC_URL` is set on Production and
   Preview, so visitors do not share public forno at 18 `getLogs` a load.

   **Verified against the live URL on 2026-09-06**, which the deploy session
   had not done: `LEASH_E2E_URL=https://leash-app-phi.vercel.app pnpm -F
   @leash/app test:e2e` → 7/7 at that deployment; the local suite is now 10/10, and `/`, `/setup`, `/accounts`, `/a/0x7aDa926B…3fd2` and
   `/opengraph-image.png` all answer 200. `README.md` now leads with the
   hosted link instead of "A hosted URL will be added here".

   The social preview landed earlier in `fb616a6`: `icon.svg`,
   `opengraph-image.png`, and a `metadataBase` that reads
   `VERCEL_PROJECT_PRODUCTION_URL`, so the absolute `og:image` resolves to the
   real domain with nothing to configure. Confirmed in the served HTML.

   Left here: `NEXT_PUBLIC_CELO_RPC_URL` currently points at forno. The
   Chainstack perk (`AGENTSATWORK`, free for the hackathon, Celo mainnet only)
   would replace it — but it is a `NEXT_PUBLIC_` value, inlined at build, so
   changing it needs a redeploy, not just an env edit.
3. **The demo is proven; what is left is the shoot.** It ran twice on
   2026-09-05 and the second run's output was checked figure by figure against
   the chain. `LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm -F @leash/examples demo`,
   roughly 0.03 USDC plus gas per take. Budget takes against the daily cap,
   not the balance: 1.00 USDC a day is about thirty runs, and it resets on
   `block.timestamp / 1 days`, i.e. at UTC midnight, not on any wall clock the
   shoot is keeping.
4. **The design system is built.** All nine tasks of
   `docs/superpowers/plans/2026-09-05-leash-design-system.md` landed on
   2026-09-05, one commit each, `e060f95`..`47e279b`, with two follow-ups
   after them (`4cbf028`, `99e0669`). The app suite went 150 -> 191, e2e
   stayed 6/6, and `tsc --noEmit` is clean in all five packages.

   Read "The design system was applied to `app/`" below rather than the plan:
   it records the four places the plan and the code disagreed, the two changes
   made beyond it, and what is still enforced by nobody. The plan itself is
   now only a record of intent.

   This entry said "**Nothing has been started**" until 2026-09-05 and was
   left that way through the session that did the work — the same staleness
   this file exists to prevent, in this file.
5. **Top up the operator before filming.** It holds 0.044505 USDC and 0 CELO;
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

### What the third wallet session found (2026-09-17)

The five manual checks of `docs/superpowers/plans/2026-09-17-leash-wallet-session.md`
Task 6, driven with two accounts in a browser extension. All five pass now.
Getting to them cost one defect and one wrong sentence in the plan itself.

- **A v1 account could not be resumed, and `/setup` blamed the network**
  (`cfef5cd`). The restore effect read `topUpEnabled()` inside its
  `Promise.all`. That function does not exist on a v1 SpendPolicyAccount, so
  the revert rejected every other read with it — limits, balance,
  `allowlistEnabled`, `owner` — and landed in the catch, which says *"Could not
  verify this account on Celo. Check your connection and try again."* and sets
  stage 1. Nothing was wrong with the connection and no retry could move it: an
  owner whose saved account was v1 was sent back to "Create protected account"
  for ever and told to check their network.

  Measured against `0x7757035d…AE0D9C` on forno, which is owned by the wallet
  that hit this and already has limits set: without the `.catch` the batch
  rejects with `ContractFunctionExecutionError: "topUpEnabled" reverted`; with
  it every figure comes back and the account restores to stage 3.

  **The dashboard had already met this exact revert on 2026-09-12** and caught
  the read individually, inside the array so the batch stays one request
  (`lib/useAccountState.ts`, ratcheted by `test/chain.test.ts`). The wizard is
  its sibling and did not. `CLAUDE.md` already said two implementations of one
  operation must not behave differently — that rule earned its line here for
  the second time, after the `examples/` receipt lag on 2026-09-05.

- **The plan told the checker to expect a key the spec says is hidden**
  (`5294d61`). Task 6's §2.2 row said a switch from wallet B back to A makes
  the generated agent key reappear, unconditionally. `cb95ebf` had corrected
  the spec in the other direction two hours after the plan was written: the
  restore effect re-runs on every wallet change and resets `agent` to `''`
  until `operators()` answers, so an unauthorised generated agent is not shown
  and must be generated again. A checker following the table would have filed
  passing behaviour as a defect — which is exactly what happened before the
  row was read against the spec.

- **What the five rows actually showed.** §2.2: the key panel disappears on a
  switch to B, does not return for an unauthorised agent on a switch back, and
  is gone from memory after a disconnect and reconnect. §2.3: a forged
  `leash.accountOwner` naming the connected wallet is overruled by `owner()`
  from inside the restore batch — stage 1 and the not-owner sentence. §2.4:
  all three connect failures say what happened, and a double press reads
  `Connecting…` and is disabled. §2.5: a switch during `Discovering…` shows
  only the new wallet's accounts, with none of the old wallet's addresses in
  between. §2.6: on a switch away, Stop, Resume and the owner drawers all
  vanish rather than being offered to a non-owner — `ownerControlView` runs
  before the Stop/Resume branch, so the paused variant is gated by the same
  line as the active one, and the label reads `Paused` in `--bg` on the danger
  band.

  The in-flight half of §2.6 was **not** checked: it needs a real `setPaused`
  sent and a wallet switch mid-write, and the plan makes that the maintainer's
  call. Task 6 is otherwise complete.

### What the fourth wallet session found (2026-09-17)

The six manual checks of `docs/superpowers/plans/2026-09-17-leash-setup-resume.md`
Task 4, driven straight after the third session with the same two wallets and a
third, empty one. All six pass. No defect in the app this time; the two things
that looked like defects were both in the checking itself.

- **What the six rows showed.** §2.3 found: with the registry deleted, /setup
  says it is checking, keeps Create shut while it looks, then resumes the
  newest of the wallet's three accounts and says how many it found. §2.3 none:
  an empty wallet gets Create enabled and no sentence at all. §2.3 new:
  `?new=1` runs no lookup, which is what an owner asking for another account
  means. §2.4: with `leash.agent.<account>` deleted, the wizard recovered the
  authorised agent from OperatorChanged history and wrote it back. §2.2
  unknown: a fabricated pending deploy holds Create shut behind two presses.
  §2.2 landed: a real deployment hash resumes its account and clears the key.

  §2.2 real was **not** checked: it needs a deployment interrupted on mainnet,
  and the plan leaves that to the maintainer.

- **§2.4 was proved against real history, not a fixture.** Account
  `0x7757035d…AE0D9C` has two OperatorChanged entries, both still enabled:
  `0xd44daF6D…` at block 76843460 and `0xC4165fDa…` at 77749918. `operators()`
  says true for both. The wizard recovered `0xC4165fDa…`, the newer -- which is
  what `liveOperators` orders and what the route returned when asked directly.

- **A transient that cannot be seen is not a transient that did not happen.**
  The "Checking whether this wallet already owns a protected account…" line
  never appeared for the empty wallet, and looked like a defect. It had run in
  **28ms**: one explorer call and no verification reads, against a wallet with
  no deployments. `performance.getEntriesByType('resource')` after the load
  settled it without guessing. Throttling to Slow 3G is what makes that line
  and the disabled Create observable at all.

  In dev the same lookup fires **twice** -- React StrictMode double-invokes the
  effect, the cleanup aborts the first, and `findOwnedAccounts` returns
  `{status: 'aborted'}` for it and writes nothing. Production runs it once.

- **Two diagnostics lied before the app did.** A snippet reported the wizard's
  stage as "not found" because it matched `Step 3 of 4` while the page renders
  `STEP 3 OF 4`, and reported the agent field as empty because an authorised
  agent replaces that input with a panel. Both were read as app defects for a
  moment. A probe that has not been checked against the rendered page is
  evidence about the probe.

### The design system, and what writing it found (2026-09-05)

The UI was reported as rough, hard to scan, and not obviously a real product.
Measuring found one cause under all three: **the app had two type sizes.**
`text-sm` carried 39 uses, and `Section.tsx` rendered every landing heading
through `Label` — 11px dim uppercase, the same treatment as the label on a
text input, and as a `<span>`, so the page had one heading in its outline.
That leaves a cliff from 36px to 11px with no rank between.

Spacing told the same story: nine steps, weighted to `mt-2` (26 uses) and
`mt-1` (12), so 14px text sat at 4-8px intervals.

`docs/design-system.md` is the result — direction, six type steps, four
spacing steps, five named grounds, the state vocabulary, component contracts,
and per-screen hierarchy. Its most valuable section invents nothing: §5 writes
down the five sentences already in the code that separate "not observed" from
"failed", which had never been recorded anywhere, so nothing stopped a new
screen from breaking them.

Two claims in its first draft were wrong and are recorded in its §9: `--ok` was
called unused when it colours two wizard confirmations and the feed dot, and
`--t-title` was going to flatten a hero that is responsive today. Both came
from a grep that matched one spelling of a token and missed two. **Count it,
do not recall it** — the same rule the rest of this repo follows.

Spec §4.1 is struck and points at the new file. It still described the Van
Gogh direction, dropped 2026-09-04. That is the third document this week found
asserting something that had stopped being true.

### The design system was applied to `app/` (2026-09-05)

All nine tasks of `docs/superpowers/plans/2026-09-05-leash-design-system.md`
are done, on `main`, one commit each: e060f95 (type scale, JetBrains Mono),
4b494ba (named grounds), bd77186 (landing hierarchy), 0fd6c69 (the dashboard's
display figure), d325a75 (one `Address` component), 874fd8d (the wizard's
steps), b545520 (404, error boundary, invalid address), 291e459 (four spacing
steps), and this one. App suite 150 -> 188, e2e 6/6, `tsc --noEmit` exit 0.

**The plan was wrong in four places, and each was found by looking rather than
by reading the diff.** Recorded so the next session does not assume the plan
and the code agree:

- Task 2 missed two elements on the paused band. Forcing the paused state in a
  browser and measuring every text node against `--bad` found the stop
  control's non-owner branch drawing "Paused" in `--dim` at 1.20:1 — the branch
  a stranger opening a shared link sees — and the network badge drawing "Celo"
  at 3.55. Every text node on that band now measures 5.10.
- Task 3 placed the "Remaining today" and "Account holds" pairs in `LiveProof`.
  They are in `Meter`. They were adopted in Task 4, which restructures `Meter`
  anyway, rather than written twice.
- Task 4 would have put a 44px figure on the landing, because `Meter` is
  rendered there too and §7 gives that screen no `--t-display` at all. `Meter`
  takes a `dominant` prop; only the dashboard passes it.
- Task 8's spacing sweep broke an e2e test that anchored on `.num` first. That
  locator had been asserting about the remaining/daily pair by position, and
  the display figure moved above it. The assertion is anchored to its own
  label now. **The unit suite did not catch this and could not** — it is a
  positional claim about rendered markup.

**Two things were changed that the plan did not ask for**, both because the
design system requires them and leaving them would have made the commit
messages false. Controls and the wordmark were inheriting the browser's 16px
system sans — a seventh size, on every screen, in the face §1 reserves for
prose. Controls are `--t-data` mono now and the wordmark `--t-label`. And the
prose treatment lives in `components/ui/prose.ts` rather than being typed out
in five components.

**Not done, and known.** `--t-display` and `--t-heading` are applied where §7
names them, but nothing mechanical enforces the type scale the way
`tokens.test.ts` enforces the palette: a component can still set `text-xs` and
no test objects. Three places still do — `ProofTable`'s hashes, `McpHandoff`'s
`<pre>`, and `HowItWorks`'s card titles, which are sans where §1 asks for mono.
The state vocabulary is still enforced by review only, as the plan's closing
section says; `Meter` now carries a comment saying those four sentences are not
to be reworded.

The test account `0xA73DB76f…F83982` is **not** paused, contrary to the note in
the live-state table above: its feed shows "Resumed by the owner" and the
dashboard reads ACTIVE. Read from the chain 2026-09-05.

### The landing page handed out a `.mcp.json` that could not start (2026-09-05)

Found while auditing whether the app is a finished product, not while looking
for bugs.

The block a stranger copies from the landing page carried
`"ATTRIBUTION_TAG": ""`, under a note telling them to replace `celo_yourtag` —
a string that block did not contain. Copying it produced a server that threw
`ATTRIBUTION_TAG is not set` before its first tool call. Spec §3.3 calls the
MCP server "the funnel, not an accessory"; this was the funnel failing at its
mouth, on the one page a stranger reaches first.

The substitution lived in the **callers**: `/setup` did it, the landing did
not, and `McpHandoff`'s own prop doc claimed the component did — so all three
descriptions of the behaviour disagreed with each other and two disagreed with
the code. `buildMcpJson` now applies `displayTag`, which derives the
substitution from the tag's *shape*, so a future caller cannot reintroduce it
by forgetting a step. `/setup`'s duplicate was removed. app is 138 -> 150
tests.

The placeholder is deliberately a value `isAttributionTag` refuses: one the
server would accept is worse than none, because it looks configured and then
misattributes every transaction.

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

- ~~The onboarding wizard asks for an attribution tag with no link explaining
  how to get one, and does not validate its shape.~~ **Both halves were stale
  when re-read on 2026-09-05.** The wizard links to celobuilders.xyz
  (`setup/page.tsx:363`) and checks the shape (`:63`), naming the expected
  format when it fails. The real instance of this hazard was on the landing
  page and is fixed — see the 2026-09-05 entry.
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
x402 purchases. The project holds **0.237776 USDC** across its four addresses —
account 0.000000, test account 0.000000, operator 0.037776, owner 0.200000 —
and 3.5367 CELO in the owner wallet. Read 2026-09-12 at block 77278716.

That is down from 2.587646 on 2026-09-07, and none of it was spent: 2.436567
went back out of the account to the funding browser wallet `0x94f7…6459` on
2026-09-07, and the remaining 0.190000 was swept to the owner EOA on
2026-09-11. Both moves left the four addresses this paragraph counts, which is
why the total fell without the gas figure moving. **Neither the account nor the
test account can spend today** — both hold nothing.

## How this project is being executed

Plan 1 ran through `superpowers:subagent-driven-development`. Plan 2 ran inline
via `superpowers:executing-plans`, since the plans carry enough context that a
fresh agent adds little. Either works.

Plan 2's plan contained three defects that only surfaced against the real chain,
all found in the pre-flight checks before money moved. Budget for that: the
verification step before a gate is not ceremony.
