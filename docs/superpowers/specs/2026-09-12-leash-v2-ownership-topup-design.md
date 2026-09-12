# Leash — v2: transferable ownership and a topUpOperator switch (Design Spec)

**Date:** 2026-09-12
**Status:** Approved in brainstorming. Not yet implemented.
**Supersedes:** nothing on paper, but it **replaces the deployed contract.**
`SpendPolicyAccount` is not upgradeable, so this document ends with a new
address and `0x7aDa926B021BAef4896F51F237bCA61435E43fd2` joining
`0x895B773Ef88cA27699Df58F9F45962F847bbE9CE` in the superseded list.
**Deadline context:** hackathon closes 2026-09-14 09:00 GMT. This is the last
contract change before it.

---

## 1. The problem

Three things stand between Leash and a stranger trusting it with money. Each was
stated loosely at first and is written here as it actually is, because the loose
version pointed at the wrong fix twice.

### 1.1 `owner` is `immutable`, so ownership cannot move

```solidity
address public immutable owner;   // SpendPolicyAccount.sol
```

The first statement of this was *"lose the owner key and you lose the funds."*
That is wrong, and the correction changes what v2 is for.

With the key gone: policy can never change, no operator can be added or removed,
the account can never be unpaused, and `sweep` can never be called. But the
funds are **not** sealed in. The operator can still call `execute` and
`topUpOperator`, so the balance drains out at the daily-cap rate, one day at a
time, for as long as `paused` is false and the token is configured. The money is
only lost outright in one case: **the account is paused at the moment the key is
lost.** Nobody can unpause it, and nobody can sweep it.

So the real hazard is *paused + key gone*, not *key gone*. And the real value of
a transfer path is not recovery at all — a lost key has nobody left to sign
with. It is **migration**: rotating from a hot wallet to a hardware wallet,
handing an account to a colleague or a company, or moving away from a wallet you
suspect is compromised, without redeploying and moving the money.

### 1.2 `topUpOperator` leaves the payee allowlist behind

```solidity
function topUpOperator(address token, uint256 amount)
    external onlyOperator notPaused
{
    _consume(token, amount);                       // caps apply
    IERC20(token).transfer(msg.sender, amount);     // allowlist does not
}
```

This is deliberate and the contract says so in a comment: x402 and EIP-3009
require the agent to sign for itself, so the funds have to reach the operator
EOA. The consequence is that a leaked operator key drains one full daily cap
**to the attacker's own address**, and the allowlist cannot stop it.

`README.md` promises otherwise:

> a leaked agent key does not become an unbounded one — it becomes a key that
> can spend at most one day's allowance, **only to addresses you named.**

The first half is true. The second half is false while `topUpOperator` exists
unconditionally.

**The app was checked and is not guilty of this.** `app/app/setup/page.tsx`
discloses the gap twice, in `--bad`:

- `:864` — "Recipient protection covers direct account payments only. Funds
  moved to the agent wallet for gas or x402 are outside this restriction."
- `:990` — "Keep only a small gas float in the agent wallet. Those funds are
  controlled by the agent and are outside recipient protection."

So this blocker is a **README defect plus a missing owner control**, not a UI
defect. An earlier reading of it called for a dashboard warning that already
exists in the wizard.

### 1.3 The contract is unaudited, and the tests do not reach its hardest line

153 lines, 32 Foundry tests, one file with fuzzing (`Limits.t.sol`). `README.md`
already discloses the lack of an audit, which is the honest thing and stays.

An audit cannot be bought in two days. What can be built is the thing an auditor
asks for first: tests that actually reach the subtle logic. The subtle logic is
one line.

```solidity
uint256 spent = l.day == today ? l.spentToday : 0;
```

The day rollover is reachable only by moving time. No stateful test moves time,
so no test has ever crossed a day boundary with spend accounting live.

---

## 2. What v2 changes

Three edits to `contracts/src/SpendPolicyAccount.sol`. Nothing else in the
contract moves.

### 2.1 Two-step ownership transfer

```solidity
address public owner;          // was: immutable
address public pendingOwner;

error NotPendingOwner();
event OwnershipTransferStarted(address indexed from, address indexed to);
event OwnershipTransferred(address indexed from, address indexed to);

function transferOwnership(address to) external onlyOwner;   // to == 0 cancels
function acceptOwnership() external;                          // pendingOwner only
```

**Two steps, not one.** A one-step `transferOwnership` makes a single mistyped
character permanent and unrecoverable — strictly worse than v1, where the
operator at least drains the balance at cap rate. With two steps the incoming
owner must sign `acceptOwnership` themselves, so an address that cannot sign can
never take ownership. `transferOwnership(address(0))` is allowed and is the
cancel: `acceptOwnership` can never be reached from the zero address, because
nothing transacts from it.

**The ABI getter `owner()` keeps its name and signature**, so every read in
`app/`, `sdk/` and `mcp/` is untouched. Only the storage location changes.

### 2.2 A `topUpOperator` switch, off by default

```solidity
bool public topUpEnabled;                    // default false, no constructor arg
error TopUpDisabled();
event TopUpEnabledSet(bool enabled);

function setTopUpEnabled(bool enabled) external onlyOwner;

function topUpOperator(address token, uint256 amount)
    external onlyOperator notPaused
{
    if (!topUpEnabled) revert TopUpDisabled();   // added
    ...
}
```

**No constructor argument**, and this was a deliberate reversal during design.
The first draft made `topUpEnabled` a constructor parameter. Reading
`app/app/setup/page.tsx` killed it:

- Stage 1 is *"Create your protected account"*. The owner has not set limits yet
  and does not yet know whether their agent needs x402. A security question
  belongs after that, not before it.
- A second constructor argument forces `deploy()` at `setup/page.tsx:349` to
  change its `args`, changes the constructor ABI, and invalidates `DEPLOY_GAS`.

A `bool` is already `false` at construction. Safe-by-default therefore costs
nothing, the deploy path does not change at all, and the switch is flipped in
stage 2 where the other optional protection already lives.

### 2.3 A zero-owner guard in the constructor

```solidity
constructor(address _owner) {
    if (_owner == address(0)) revert ZeroOwner();
    owner = _owner;
}
```

One `if`, guarding exactly the class of failure §1.1 is about: a contract that
holds money and has no administrator. v1 accepts `address(0)` without comment.
The wizard always passes the connected wallet, so this is unreachable through
the product — and reachable by anyone deploying the bytecode directly.

---

## 3. What v2 does not fix

Stated here so the README cannot drift back into overclaiming.

- **The switch does not make `topUpOperator` safe. It makes it optional.** When
  an owner turns it on for x402, the hole in §1.2 returns in full: money leaves
  the contract to the operator EOA, outside the allowlist, bounded only by the
  daily cap. What changes is that the owner chose it, knowingly, rather than
  receiving it by default.
- **Ownership transfer is not key recovery.** A key already lost has nobody to
  sign the transfer. See §1.1.
- **`sweep` still bypasses policy, the allowlist and the pause.** Deliberate:
  policy constrains the operator, never the owner. The contract comment stays.
- **Still unaudited.** §10 adds invariants, not an audit. `README.md` keeps
  saying so.
- **v1 accounts cannot be upgraded.** Not upgradeable. Anyone holding a v1
  account — including the project's own test account
  `0xA73DB76f20c5ede3ABE883565D22905760F83982`, which reads `paused` true as of
  2026-09-12 — stays on v1 for ever. Getting the switch means deploying a new
  account and moving the money.

---

## 4. Decisions taken — do not re-litigate

- **Redeploy before the deadline**, not after. The risk was put on the table
  (two days, and every "proven on mainnet" claim has to be earned again) and the
  maintainer chose it.
- **No factory.** It was considered and rejected for this deployment. A factory
  would give deterministic addresses and take the deploy bytecode out of the
  frontend, but `app/app/api/accounts/discover/route.ts` finds accounts by
  scanning **direct deployments from the owner EOA**; behind a factory the
  deployer is the factory, and discovery would have to be rewritten. Too much
  beside a redeploy and a full re-proof. It stays on the deferred list.
- **A switch, not separate caps, for `topUpOperator`.** Separate per-tx/daily
  caps for the top-up path were considered. They shrink the hole without
  closing it — the money still lands in the operator EOA outside the allowlist —
  at the cost of another mapping, another setter and another `_consume` branch.
- **Ownership transfer is not in the wizard.** Setup creates an account;
  transferring it is administration. It belongs in `/a/[address]` under
  `#agent-management`, which is already gated on `isOwner`.

---

## 5. Every seam that moves

Read this as the checklist; §6 details the wizard and §7 the order.

**Contract and its build**

- `contracts/src/SpendPolicyAccount.sol` — the three edits. 153 → ~190 lines.
- `contracts/script/Deploy.s.sol` — **runs unchanged** (the constructor keeps its
  single argument), but it only calls `setOperator`. It does not set policy or
  the switch; the wizard does.
- `app/lib/contract.ts` — regenerated by `forge build`. ABI **and** bytecode.

**SDK**

- `sdk/src/abi.ts` — add errors `TopUpDisabled`, `NotPendingOwner`, `ZeroOwner`;
  add `topUpEnabled`, `pendingOwner`, `transferOwnership`, `acceptOwnership`,
  `setTopUpEnabled`; add events `OwnershipTransferStarted`,
  `OwnershipTransferred`, `TopUpEnabledSet`.
- `sdk/src/policyClient.ts` — `describePreCheckFailure` gains
  `case 'TopUpDisabled'` → error `top_up_disabled`. It must follow the rule the
  2026-09-05 session paid for: **a non-cap refusal says who can clear it and
  that waiting will not.** Waiting until UTC midnight clears nothing here; only
  the owner calling `setTopUpEnabled(true)` does. `preCheckTopUp`
  (`policyClient.ts:289`) is the path that will see it.
- `sdk/src/x402/index.ts` — the draw step now has a refusal that is not a cap.
  Its message must name the owner as the only party who can lift it.

**MCP**

- `mcp/src/tools/pay.ts` and `fetch.ts` — surface `top_up_disabled` with one
  actionable suggestion, built from the SDK's `describePreCheckFailure` so a
  change there fails in `mcp` tests rather than reaching an agent. This is the
  existing contract in `mcp/src/errors.ts`; follow it.

**App**

- `app/lib/useFeed.ts` (`:16-30` is the hand-written event list) and
  `app/lib/feed.ts` `describeLog` — three new events. `belongsToToken`
  (`feed.ts:113`) must treat all three as **global**, like `PausedSet` and
  `OperatorChanged`: none of them carries a `token` field, so the current
  fallback would drop them silently.
- `app/app/setup/page.tsx` — §6.
- `app/app/a/[address]/page.tsx` — the ownership transfer control, inside
  `#agent-management`, gated on `isOwner` (`canEdit(state.owner, connected)`,
  never `?operator=`). Two writes: `transferOwnership` by the current owner, and
  `acceptOwnership`, which **the incoming owner must be able to reach** — so the
  drawer has to render an accept affordance when `connected === pendingOwner`,
  a person who is not yet the owner and for whom `isOwner` is false.
- `app/lib/chain.ts` — every owner-write gas constant re-measured with
  `cast estimate` on mainnet after deploy, plus new constants for
  `setTopUpEnabled`, `transferOwnership`, `acceptOwnership`. `owner` became an
  SLOAD, so every `onlyOwner` call costs ~2100 more; `topUpOperator` costs
  ~2100 more again. The existing constants are roughly double their
  measurements on purpose (warm storage understates a fresh account by ~17,000
  gas per cold slot) — keep that margin.
- `app/lib/contract.ts` — see above. **Regenerating this is step 2 of §7 and
  skipping it deploys v1 from a v2 UI.**

**Every file naming the old address** — 17 files, ~35 occurrences:
`README.md`, `docs/RESUME.md`, `docs/deployments.md`, three plans under
`docs/superpowers/plans/`, `app/lib/chain.ts`,
`app/components/landing/LiveProof.tsx`, `app/components/landing/SiteFooter.tsx`,
`app/app/a/[address]/page.tsx`, `app/e2e/dashboard.spec.ts`,
`app/e2e/landing.spec.ts`, `app/test/accountHealth.test.ts`,
`app/test/deploy.test.ts`, `app/test/mcpJson.test.ts`,
`sdk/test/leashConfirm.test.ts`, `mcp/test/bundle.test.ts`.

**Not a seam:** `mcp/src/config.ts` reads the account from `LEASH_ACCOUNT`
(`:40`), so nothing shipped to users is pinned to an address. A redeploy does
not break an installed `leash-agentpay`.

---

## 6. The wizard: four changes, and two things that hold still

`app/app/setup/page.tsx`, 1080 lines, four stages.

**Stage 1 — one sentence becomes false.** `:771` reads:

> "The owner is permanent. Use a wallet you will keep secure; it must not be the
> agent wallet."

The first clause is wrong in v2 and must be rewritten. It is the only copy
change blocker 1 forces. The deploy handler at `:349` does **not** change,
because §2.2 dropped the constructor argument.

**Stage 2 — one new optional block, copying the pattern beside it.** "Recipient
protection" (`:818-866`) is already the right shape: two `aria-pressed` buttons,
one on-chain write, `pollUntil` on the condition rather than the receipt, and a
note whose colour comes from `noteColor`. An *"Agent-funded payments (x402)"*
block sits next to it, calls `setTopUpEnabled`, and polls `topUpEnabled()`. Two
entries go into `SETUP_ABI` (`:46-63`, a hand-written local ABI, not the
generated one).

The red disclosure at `:864` can then say something stronger than it does now:
not that a gap exists, but that it is **closed** — and, when the owner switches
top-ups on, that it is open and why.

**Stage 3 — no change.** Funding the agent's gas float is the owner's transfer
either way; the switch governs the agent drawing from the account, not the owner
sending to the agent.

**Stage 4 — one new review row.** The `<dl>` at `:1045` ends with
"Direct-payment recipients: Approved addresses only / Any address". It needs the
sibling row "Agent-funded payments: Off / On", or the review screen omits a
protection the owner just chose.

**`app/lib/setup.ts` does not change.** `SetupReadiness` needs no new field: the
switch is optional exactly as recipient protection is, and recipient protection
is not in readiness either (`recipientReady` is local page state). So
`setupReadiness` and `firstSetupStage` — the most heavily tested logic in the
wizard — stand still.

**The new block is invisible to e2e.** All 41 Playwright tests run with no
wallet, which pins them to stage 1. Stage 2 is reachable only with a connected
wallet, so the new block is covered by unit tests and a manual wallet session
and by nothing else. Two specs do reach `/setup` and constrain it:
`faces.spec.ts` counts **rendered** type faces and `measure.spec.ts` holds every
prose line to the measure. New copy must use an existing type step and stay
inside the measure or both go red.

---

## 7. Migration order, and the one step that fails silently

**There is no money to move.** Both `0x7aDa926B…3fd2` and the test account hold
0.000000 USDC, read at block 77278716 on 2026-09-12. The old account is left
untouched and marked superseded; its transaction hashes stay in
`docs/deployments.md` as true statements about **v1**.

1. Contract edits and the full test suite from §10 green under `forge test`.
2. **`forge build`, then regenerate `app/lib/contract.ts`.** A stale bytecode
   here deploys v1 from a v2 interface and everything afterwards looks like
   success. `CLAUDE.md` names this hazard; it is the reason step 3 goes through
   the wizard.
3. Deploy the new demo account **through the wizard, with a real browser
   wallet** — not `forge script`. A script proves the contract; the wizard is
   the product's front door and step 2 is exactly where a stale-bytecode bug
   would hide.
4. Source-verify on Celoscan through the Etherscan V2 endpoint pinned in
   `foundry.toml`, with `CELOSCAN_KEY`. Without it the README's
   "Contract: source-verified" badge is false.
5. Re-measure the gas constants (§5, `app/lib/chain.ts`) with `cast estimate` on
   mainnet, from the owner EOA, against the **new** account.
6. Re-run the proofs in §8.
7. Update the 17 files, add a `docs/deployments.md` entry for the new
   deployment, move `0x7aDa926B…3fd2` into the superseded section, and correct
   `README.md` — including the §1.2 sentence, which is the point of the exercise.

---

## 8. Which proofs must be earned again

| Proof | Re-run? | Why |
|---|---|---|
| The policy gates an on-chain spend | **Yes** | one spend, one refusal |
| Zero-CELO gas | Free | any operator transaction on the new account shows it |
| Attribution round-trips | Free | decode the data suffix of a new transaction |
| A real MCP agent spent through the policy | **Yes** | `leash_pay` against the new account |
| The demo runs end to end | **Yes** | three spends and a refusal |
| x402 paid with money drawn through the policy (Path B) | **Yes** | it only runs with `topUpEnabled` true, so it proves the switch as well |
| The live feed updates without a reload | **Yes** | watch the above land; also covers the three new events |
| A real x402 purchase from the operator's own balance | **No** | `tx: 0x0ac87832…b46e` never touched the contract, so v2 cannot have falsified it |

**The leaderboard does not reset.** Attribution is not tied to the contract.
The `celo_3dec652cd977` tag rides in each transaction's ERC-8021 data suffix,
and x402 settlements are credited to `agentWalletAddress` — the operator EOA
`0xd44daF…50D6`, which does not change. "Real World Adoption: verified users 2,
returning 2" survives the redeploy. See `docs/registration.md`.

---

## 9. Funding

Read at block 77278716: owner `0x2B33…4f57` holds 0.200000 USDC and 3.5367
CELO; operator `0xd44daF…50D6` holds 0.037776 USDC and **0 CELO**, by design.

One clean pass of §8 costs roughly 0.12 USDC in spends plus 0.06 in operator
gas at ~0.00286 a transaction. That is one pass with no retry room, against a
project whose x402 gate has historically needed two runs, and a shoot that costs
~0.03 a take on top. CELO for the owner's writes is not a constraint.

**The maintainer is funding rather than shrinking the proof amounts.**
Recommended: **1.00 USDC into the new account** — one full daily cap, so the cap
never interrupts a take and the account never holds more than a day of exposure
— and **0.15 USDC to the operator**, about fifty transactions of gas float.

The daily cap resets on `block.timestamp / 1 days`, which is UTC midnight and
not any wall clock the shoot is keeping.

---

## 10. Tests: what replaces an audit

32 tests today, all unit, one file fuzzing. Target ~60. Three new files.

**`Invariants.t.sol`, with a handler.** Six invariants, each the machine
statement of something v2 promises:

| Invariant | The bug it forbids |
|---|---|
| `remainingToday() == 0` once `spentToday >= daily` today | a cap that stops binding |
| `remainingToday() <= daily` | underflow in `daily > spent ? daily - spent : 0` |
| `balanceOf == funded - spent - toppedUp - swept` | value leaving by a path nobody accounts for |
| every outward transfer traces to an operator or owner call | a missing modifier |
| **`owner != address(0)`, always** | §1.1 — pins the constructor guard and the two-step |
| `owner` equals the last address to have ACCEPTED | the two-step collapsing into one step |

**Two of these were restated after the first draft failed on correct contract
behaviour, and the corrections are the point rather than a footnote.**
`spentToday <= daily` is not a property this contract has: an owner may lower a
cap below what today has already spent, and `setPolicy` does not reconcile
`spentToday` downward because that would GRANT allowance. What the contract
guarantees is that nothing further is admitted, which `remainingToday` reports
as zero. And `pendingOwner != owner` is not a property either: an owner may
nominate itself, which is a harmless no-op. The property worth asserting is that
`owner` only ever becomes an address that called `acceptOwnership`, which needs a
ghost the handler writes only on a successful acceptance.

**The handler must expose `warpDay()`.** Everything hard in this contract is the
day rollover, and a stateful run that never moves time never reaches it. That is
where a real bug would be hiding, and it is the gap §1.3 identifies.

**`Ownership2Step.t.sol`** — transfer then accept moves `owner`; a non-pending
caller gets `NotPendingOwner`; `transferOwnership(0)` cancels; a pending owner
has no `onlyOwner` power before accepting; the old owner keeps full power until
acceptance; `ZeroOwner` on construction.

**`TopUpSwitch.t.sol`** — `topUpOperator` reverts `TopUpDisabled` by default;
works once enabled; `execute` is unaffected in both states; only the owner can
flip it; a disabled top-up consumes **no** daily allowance — which holds wherever the
check sits, because a revert unwinds `_consume`'s storage writes in the same
call frame. Placing the check before `_consume` is a gas choice, not a safety
one: it avoids paying for writes the revert discards. **An earlier revision of
this document claimed the ordering was load-bearing for allowance accounting.
That was wrong**, proved by a test in which a revert fired after `_consume` and
`remainingToday` was still untouched.

**Fuzz, stateless:** the `perTx` boundary is exact (`cap` passes, `cap + 1`
reverts); daily accumulates exactly; a day rollover resets the spend;
`acceptOwnership` is reachable only by `pendingOwner`; `topUpOperator` reverts
for every amount while disabled.

None of this costs money or needs a chain.

---

## 11. Risks

- **Two days, and the proof work is serial.** Steps 3 through 6 of §7 each need
  a human with a wallet and each waits on the chain. If funding or the browser
  session slips, the deadline arrives with a v2 contract deployed and a README
  still describing v1's proofs. Mitigation: §7's order puts every free, offline
  step first, so a slip leaves the repo consistent rather than half-migrated.
- **`app/lib/contract.ts` is generated and silent when stale.** Named in
  §7 step 2 and in `CLAUDE.md`. The guard is that step 3 deploys through the
  wizard, which reads that file.
- **The new stage-2 block has no e2e coverage** (§6). It is covered by unit
  tests and one manual wallet session.
- **`acceptOwnership` is reached by someone who is not the owner.** Every write
  affordance in `app/` is gated on `isOwner`. The accept control is the first
  one that must render for a connected wallet that is only `pendingOwner`, read
  from the chain — never from a query parameter. Getting this gate wrong either
  hides the control from the one person who needs it or shows owner controls to
  a stranger.
- **Gas constants are measured against a warm account.** Re-measure on the new
  deployment before the shoot, and keep the existing doubling margin.
