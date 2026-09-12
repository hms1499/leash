# Leash v2 — Ownership Transfer and the topUpOperator Switch: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SpendPolicyAccount`'s owner transferable in two steps and put `topUpOperator` behind an owner switch that is off by default, then carry both through the SDK, the MCP server and the app, redeploy to Celo mainnet, and earn every "proven on mainnet" claim again.

**Architecture:** Three edits to a 153-line non-upgradeable contract, then outward through the seams that read it. Everything free and offline lands first (Tasks 1–9): contract, invariants, generated ABI, SDK revert mapping, MCP refusal text, feed events, wizard, dashboard, README. Only then the mainnet half (Tasks 10–13), which costs money and needs a human at a browser wallet. The order is deliberate — a slip in the paid half leaves the repo consistent rather than half-migrated.

**Tech Stack:** Solidity 0.8.24, Foundry (forge test, invariant testing, `cast estimate`), TypeScript, viem, wagmi, Next.js App Router, vitest, Playwright, pnpm 9.12.0, Node 20.

**Spec:** `docs/superpowers/specs/2026-09-12-leash-v2-ownership-topup-design.md` — read it first. This plan argues from it and does not repeat its reasoning.

## Global Constraints

- **The contract is not upgradeable.** Every contract edit in Tasks 1–3 must be complete and reviewed before Task 10 deploys. There is no second chance at the same address.
- **`forge build` regenerates `app/lib/contract.ts` (ABI *and* bytecode). A stale copy deploys v1 from a v2 interface and every later step looks like success.** This is Task 4 and it gates Task 10.
- **Always send an explicit `gas` on every write.** A gas estimate is a reserve, not a price; with no limit the reserve is the *block* gas limit — measured at 0.465 USDC against 0.0022 actually spent. See `GAS_LIMIT` in `sdk/src/policyClient.ts` and the constants in `app/lib/chain.ts`.
- **Always pass an explicit `chainId` on every wagmi write.** `writeContract` and `deployContract` do not check which chain they are signing on.
- **Wait on the condition, not the receipt.** forno is load-balanced and serves stale reads after a confirmed transaction. Use `pollUntil` from `app/lib/confirm.ts`, and never report a write as confirmed unless the poll observed it. `waitForTransactionReceipt` resolves on revert — check `receipt.status`.
- **Batch reads stay in one `Promise.all`.** `app/lib/useAccountState.ts:85` batches its reads so viem can multicall them. Adding a read means adding an element to that array, never an awaited call after it.
- **Never run `test:gate` in `sdk` or `mcp`.** Those spend real money on mainnet and are excluded from `test` on purpose.
- **No new dependency** in any `package.json`.
- **Style:** no ESLint, Prettier or Biome config exists. Match surrounding code — 2-space indent, no semicolons, single quotes, `type` over `interface` in `mcp`. Solidity follows the existing file: errors and events declared next to the functions that use them, not grouped at the top.
- **Comments explain *why*,** especially where a line guards a hazard that was paid for. Match that density and do not strip existing comments when editing nearby code.
- **Commit subjects describe the defect or the change in plain English, not the diff.** Bodies explain reasoning and cite evidence.
- **The pre-commit guard** (`scripts/check-secrets.sh`) allows a 64-hex value only when labelled as a transaction hash **within 10 characters**: write `tx: 0x…` or an explorer URL.
- **Copy rules for anything rendered:** money uses the `.num` class. New text must use an existing type step from `docs/design-system.md` and stay inside the prose measure, or `app/e2e/faces.spec.ts` and `measure.spec.ts` go red. Dark grounds take any foreground but `--bg`; bright grounds take only `--bg`.
- **Run `npx tsc --noEmit`** in each package you touched before its commit.

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `contracts/test/Ownership2Step.t.sol` | the transfer/accept state machine and the zero-owner guard |
| `contracts/test/TopUpSwitch.t.sol` | the switch, and that a refused draw consumes no allowance |
| `contracts/test/Invariants.t.sol` | six stateful invariants |
| `contracts/test/handlers/AccountHandler.sol` | the bounded action surface the invariant runner drives, including `warpDay` |
| `app/components/OwnershipDrawer.tsx` | transfer for the owner, accept for the pending owner |
| `app/test/ownership.test.ts` | the pure decisions behind that drawer |

**Modified**

| File | Change |
|---|---|
| `contracts/src/SpendPolicyAccount.sol` | the three edits |
| `contracts/foundry.toml` | an `[invariant]` section so runs are deterministic |
| `app/lib/contract.ts` | regenerated — never hand-edited |
| `sdk/src/abi.ts` | new functions, errors and events |
| `sdk/src/policyClient.ts` | `describePreCheckFailure` gains `TopUpDisabled` |
| `sdk/src/x402/index.ts` | the draw step's non-cap refusal |
| `mcp/src/tools/pay.ts` | `top_up_disabled` in `WITHOUT_NUMBERS` |
| `app/lib/feed.ts` | `describeLog` and `belongsToToken` for three new events |
| `app/lib/useFeed.ts` | `EVENT_ABI` gains the three |
| `app/lib/useAccountState.ts` | reads `pendingOwner` and `topUpEnabled` inside the existing `Promise.all` |
| `app/app/setup/page.tsx` | stage 1 copy, stage 2 block, stage 4 row, `SETUP_ABI` |
| `app/app/a/[address]/page.tsx` | mounts `OwnershipDrawer` |
| `app/lib/chain.ts` | re-measured gas constants, three new ones |
| `README.md` | the sentence that overclaims, and the new address |
| `docs/deployments.md`, `docs/RESUME.md` | the new deployment and the superseded one |

---

## Task 1: Two-step ownership transfer, and a constructor that refuses address zero

**Files:**
- Modify: `contracts/src/SpendPolicyAccount.sol:18` (the `owner` declaration) and `:36-38` (the constructor)
- Test: `contracts/test/Ownership2Step.t.sol` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `owner()` (unchanged signature, now storage-backed), `pendingOwner() → address`, `transferOwnership(address to)`, `acceptOwnership()`, `error NotPendingOwner()`, `error ZeroOwner()`, `event OwnershipTransferStarted(address indexed from, address indexed to)`, `event OwnershipTransferred(address indexed from, address indexed to)`. Tasks 3, 4, 6, 8 depend on these exact names.

- [ ] **Step 1: Write the failing test file**

Create `contracts/test/Ownership2Step.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";

contract Ownership2StepTest is Test {
    SpendPolicyAccount account;
    address owner = address(0xA11CE);
    address incoming = address(0xC0FFEE);
    address stranger = address(0xDEAD);

    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    function setUp() public {
        vm.prank(owner);
        account = new SpendPolicyAccount(owner);
    }

    function test_constructorRefusesZeroOwner() public {
        vm.expectRevert(SpendPolicyAccount.ZeroOwner.selector);
        new SpendPolicyAccount(address(0));
    }

    function test_pendingOwnerStartsEmpty() public view {
        assertEq(account.pendingOwner(), address(0));
    }

    function test_transferOnlyNominates() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        // The whole point of two steps: nominating changes nothing yet.
        assertEq(account.owner(), owner);
        assertEq(account.pendingOwner(), incoming);
    }

    function test_acceptMovesOwnership() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.prank(incoming);
        account.acceptOwnership();
        assertEq(account.owner(), incoming);
        assertEq(account.pendingOwner(), address(0));
    }

    function test_strangerCannotAccept() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.prank(stranger);
        vm.expectRevert(SpendPolicyAccount.NotPendingOwner.selector);
        account.acceptOwnership();
    }

    function test_acceptWithNoNominationReverts() public {
        vm.prank(stranger);
        vm.expectRevert(SpendPolicyAccount.NotPendingOwner.selector);
        account.acceptOwnership();
    }

    function test_strangerCannotTransfer() public {
        vm.prank(stranger);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.transferOwnership(stranger);
    }

    /// The nominee holds no owner power before accepting. A one-step transfer
    /// would have handed it over here.
    function test_pendingOwnerHasNoPowerBeforeAccepting() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.prank(incoming);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.setPaused(true);
    }

    function test_oldOwnerKeepsPowerUntilAccepted() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.prank(owner);
        account.setPaused(true);
        assertTrue(account.paused());
    }

    function test_oldOwnerLosesPowerAfterAccepted() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.prank(incoming);
        account.acceptOwnership();
        vm.prank(owner);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.setPaused(true);
    }

    /// Nominating the zero address is the cancel. acceptOwnership can never be
    /// reached from address(0) because nothing transacts from it.
    function test_transferToZeroCancelsANomination() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.prank(owner);
        account.transferOwnership(address(0));
        assertEq(account.pendingOwner(), address(0));
        vm.prank(incoming);
        vm.expectRevert(SpendPolicyAccount.NotPendingOwner.selector);
        account.acceptOwnership();
    }

    function test_nominationCanBeReplaced() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.prank(owner);
        account.transferOwnership(stranger);
        assertEq(account.pendingOwner(), stranger);
        vm.prank(incoming);
        vm.expectRevert(SpendPolicyAccount.NotPendingOwner.selector);
        account.acceptOwnership();
    }

    function test_transferEmitsStarted() public {
        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferStarted(owner, incoming);
        vm.prank(owner);
        account.transferOwnership(incoming);
    }

    function test_acceptEmitsTransferred() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.expectEmit(true, true, false, false);
        emit OwnershipTransferred(owner, incoming);
        vm.prank(incoming);
        account.acceptOwnership();
    }

    /// sweep is the owner's escape hatch and must follow ownership, or a
    /// handover would leave the money reachable only by the previous holder.
    function test_sweepFollowsTheNewOwner() public {
        vm.prank(owner);
        account.transferOwnership(incoming);
        vm.prank(incoming);
        account.acceptOwnership();
        vm.prank(owner);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.sweep(address(0xBEEF), owner, 1);
    }

    function testFuzz_onlyThePendingOwnerCanAccept(address nominee, address caller) public {
        vm.assume(nominee != address(0));
        vm.assume(caller != nominee);
        vm.prank(owner);
        account.transferOwnership(nominee);
        vm.prank(caller);
        vm.expectRevert(SpendPolicyAccount.NotPendingOwner.selector);
        account.acceptOwnership();
        assertEq(account.owner(), owner);
    }
}
```

- [ ] **Step 2: Run it and watch it fail for the right reason**

```bash
cd contracts && forge test --match-path test/Ownership2Step.t.sol
```

Expected: compilation failure — `ZeroOwner`, `NotPendingOwner`, `pendingOwner`, `transferOwnership` and `acceptOwnership` do not exist yet. A compile error here is the correct failure; do not proceed until you have seen it.

- [ ] **Step 3: Change the owner declaration**

In `contracts/src/SpendPolicyAccount.sol`, replace line 18:

```solidity
    address public immutable owner;
```

with:

```solidity
    // Storage, not immutable, so ownership can move. The getter keeps its name
    // and signature, so every read in app/, sdk/ and mcp/ is unaffected.
    //
    // This is migration, not recovery: a key already lost has nobody left to
    // sign transferOwnership. What it buys is rotating a hot wallet to a
    // hardware wallet, handing an account to a colleague, or leaving a wallet
    // you suspect is compromised — none of which used to be possible without
    // redeploying and moving the money.
    address public owner;
    address public pendingOwner;
```

- [ ] **Step 4: Add the errors, events and the two functions**

Immediately after the `constructor` in the same file, add:

```solidity
    error NotPendingOwner();
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    /// @notice Nominates the next owner. Nothing changes until they accept.
    /// @dev Two steps on purpose. A one-step transfer makes a single mistyped
    ///      character permanent and unrecoverable — strictly worse than an
    ///      immutable owner, where the operator at least drains the balance at
    ///      the daily-cap rate. `to == address(0)` cancels a nomination:
    ///      acceptOwnership can never be reached from the zero address.
    function transferOwnership(address to) external onlyOwner {
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    /// @notice Completes a transfer. Only the nominee can call it, which is
    ///         what makes an address that cannot sign unable to take ownership.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address from = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(from, msg.sender);
    }
```

- [ ] **Step 5: Guard the constructor**

Replace the constructor body (`:36-38`):

```solidity
    constructor(address _owner) {
        owner = _owner;
    }
```

with:

```solidity
    error ZeroOwner();

    constructor(address _owner) {
        // A fund-holding contract with no administrator is exactly the failure
        // transferable ownership exists to prevent, and v1 accepted it without
        // comment. The wizard always passes the connected wallet, so this is
        // unreachable through the product and reachable by anyone deploying the
        // bytecode directly.
        if (_owner == address(0)) revert ZeroOwner();
        owner = _owner;
    }
```

- [ ] **Step 6: Run the new file and then the whole suite**

```bash
cd contracts && forge test --match-path test/Ownership2Step.t.sol
```
Expected: 16 passed.

```bash
cd contracts && forge test
```
Expected: 48 passed (32 existing + 16). **Every one of the 32 must still pass** — `Ownership.t.sol` asserts `owner()` at construction and must be unaffected.

- [ ] **Step 7: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add contracts/src/SpendPolicyAccount.sol contracts/test/Ownership2Step.t.sol
git commit -m "$(cat <<'EOF'
feat(contracts): an owner key can be rotated instead of only lost

owner was immutable, so an account could never change hands. Losing the key
did not lose the funds outright — the operator keeps draining at the daily-cap
rate — but policy, operators, pause and sweep all froze for ever, and an
account that was paused when the key went was sealed shut.

transferOwnership nominates and acceptOwnership completes, in two steps,
because a one-step transfer makes one mistyped character permanent and is
strictly worse than an immutable owner. Nominating address(0) cancels.

The constructor now refuses address(0), which v1 accepted without comment.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## Task 2: `topUpOperator` behind an owner switch, off by default

**Files:**
- Modify: `contracts/src/SpendPolicyAccount.sol` — the state block near `allowlistEnabled` (`:105`) and `topUpOperator` (`:128-137`)
- Test: `contracts/test/TopUpSwitch.t.sol` (create)

**Interfaces:**
- Consumes: Task 1's contract.
- Produces: `topUpEnabled() → bool`, `setTopUpEnabled(bool enabled)`, `error TopUpDisabled()`, `event TopUpEnabledSet(bool enabled)`. Tasks 3, 4, 5, 6, 7 depend on these exact names.

- [ ] **Step 1: Write the failing test file**

Create `contracts/test/TopUpSwitch.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract TopUpSwitchTest is Test {
    SpendPolicyAccount account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);
    address payee = address(0xCAFE);

    event TopUpEnabledSet(bool enabled);

    function setUp() public {
        vm.startPrank(owner);
        account = new SpendPolicyAccount(owner);
        account.setOperator(operator, true);
        token = new MockERC20();
        account.setPolicy(address(token), 5e6, 10e6);
        vm.stopPrank();
        token.mint(address(account), 100e6);
    }

    function test_switchIsOffAtConstruction() public view {
        assertFalse(account.topUpEnabled());
    }

    /// The blocker this closes: a leaked operator key drew a full daily cap to
    /// its own address, and the payee allowlist could not stop it.
    function test_topUpRevertsWhileDisabled() public {
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.TopUpDisabled.selector);
        account.topUpOperator(address(token), 1e6);
    }

    function test_topUpWorksOnceEnabled() public {
        vm.prank(owner);
        account.setTopUpEnabled(true);
        vm.prank(operator);
        account.topUpOperator(address(token), 1e6);
        assertEq(token.balanceOf(operator), 1e6);
    }

    /// A refused draw must cost the agent nothing. If the check sat after
    /// _consume, a disabled top-up would silently eat the day's allowance and
    /// the agent would be told to wait for a reset it had already spent.
    function test_refusedTopUpConsumesNoAllowance() public {
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.TopUpDisabled.selector);
        account.topUpOperator(address(token), 4e6);
        assertEq(account.remainingToday(address(token)), 10e6);
    }

    function test_onlyOwnerCanFlipIt() public {
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.setTopUpEnabled(true);
    }

    function test_itCanBeTurnedBackOff() public {
        vm.startPrank(owner);
        account.setTopUpEnabled(true);
        account.setTopUpEnabled(false);
        vm.stopPrank();
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.TopUpDisabled.selector);
        account.topUpOperator(address(token), 1e6);
    }

    function test_executeIsUnaffectedWhileDisabled() public {
        vm.prank(operator);
        account.execute(address(token), payee, 1e6);
        assertEq(token.balanceOf(payee), 1e6);
    }

    function test_executeIsUnaffectedWhileEnabled() public {
        vm.prank(owner);
        account.setTopUpEnabled(true);
        vm.prank(operator);
        account.execute(address(token), payee, 1e6);
        assertEq(token.balanceOf(payee), 1e6);
    }

    /// The switch governs the path, not the caps: an enabled top-up is still
    /// bounded by perTx and daily.
    function test_anEnabledTopUpStillObeysThePerTxCap() public {
        vm.prank(owner);
        account.setTopUpEnabled(true);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.PerTxCapExceeded.selector, 6e6, 5e6)
        );
        account.topUpOperator(address(token), 6e6);
    }

    function test_pauseStillBeatsAnEnabledSwitch() public {
        vm.startPrank(owner);
        account.setTopUpEnabled(true);
        account.setPaused(true);
        vm.stopPrank();
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.ContractPaused.selector);
        account.topUpOperator(address(token), 1e6);
    }

    function test_flipEmits() public {
        vm.expectEmit(false, false, false, true);
        emit TopUpEnabledSet(true);
        vm.prank(owner);
        account.setTopUpEnabled(true);
    }

    function testFuzz_everyAmountIsRefusedWhileDisabled(uint96 amount) public {
        vm.assume(amount > 0);
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.TopUpDisabled.selector);
        account.topUpOperator(address(token), amount);
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd contracts && forge test --match-path test/TopUpSwitch.t.sol
```
Expected: compilation failure — `topUpEnabled`, `setTopUpEnabled` and `TopUpDisabled` do not exist.

- [ ] **Step 3: Add the state, the error, the event and the setter**

In `contracts/src/SpendPolicyAccount.sol`, beside `bool public allowlistEnabled;`, add:

```solidity
    // Off at construction, and deliberately not a constructor argument: a bool
    // is already false, so safe-by-default costs nothing here, the deploy path
    // and DEPLOY_GAS stay untouched, and the question is asked in wizard stage
    // 2 beside the other optional protection rather than before the owner has
    // set any limits.
    bool public topUpEnabled;

    error TopUpDisabled();
    event TopUpEnabledSet(bool enabled);

    function setTopUpEnabled(bool enabled) external onlyOwner {
        topUpEnabled = enabled;
        emit TopUpEnabledSet(enabled);
    }
```

- [ ] **Step 4: Gate the function — before `_consume`, not after**

In `topUpOperator`, add the check as the **first** statement in the body:

```solidity
    function topUpOperator(address token, uint256 amount)
        external
        onlyOperator
        notPaused
    {
        // Before _consume, never after: a refused draw must cost the agent
        // nothing. Behind _consume, a disabled top-up would silently eat the
        // day's allowance and then tell the agent to wait for a reset it had
        // already spent.
        if (!topUpEnabled) revert TopUpDisabled();
        _consume(token, amount);
```

Leave the rest of the body as it is. Update the existing doc comment above the function so it no longer implies the path is always open: keep the sentence explaining why the allowlist cannot apply, and add that the owner must enable it.

- [ ] **Step 5: Run the new file, then everything**

```bash
cd contracts && forge test --match-path test/TopUpSwitch.t.sol
```
Expected: 12 passed.

```bash
cd contracts && forge test
```
Expected: **`TopUp.t.sol` now fails.** It was written against a contract where `topUpOperator` always worked. Read each failure, then add `account.setTopUpEnabled(true)` to that file's `setUp` with a comment saying the default is off and this suite is about the path once opened. Re-run until all pass. Expected after the fix: 60 passed (48 + 12).

- [ ] **Step 6: Commit**

```bash
cd /Users/vanhuy/Desktop/celo
git add contracts/src/SpendPolicyAccount.sol contracts/test/TopUpSwitch.t.sol contracts/test/TopUp.t.sol
git commit -m "$(cat <<'EOF'
feat(contracts): the drain path a leaked agent key had is now off until the owner opens it

README promises a leaked agent key can spend "only to addresses you named".
topUpOperator does not pass through the payee allowlist — by design, because
x402 and EIP-3009 need the agent to sign for itself — so that promise was false
for any account with funds: the key drew a full daily cap to its own address.

topUpEnabled is off at construction and only the owner can flip it. The check
sits before _consume, so a refused draw costs no allowance; behind it, a
disabled top-up would have eaten the day's cap and then told the agent to wait
for a reset it had already spent.

TopUp.t.sol was written against a contract where the path was always open and
now enables it in setUp.

This makes the path optional, not safe. An owner who turns it on for x402 has
the same exposure v1 had, knowingly rather than by default.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## Task 3: Six invariants, and a handler that can move time

**Files:**
- Create: `contracts/test/handlers/AccountHandler.sol`, `contracts/test/Invariants.t.sol`
- Modify: `contracts/foundry.toml`

**Interfaces:**
- Consumes: the contract from Tasks 1 and 2.
- Produces: nothing other code imports. This task's output is confidence.

- [ ] **Step 1: Pin the invariant runner so results are reproducible**

Append to `contracts/foundry.toml`:

```toml
# Pinned rather than left to defaults so a failing run can be reproduced and a
# passing one means something specific. depth is what lets a sequence reach a
# day boundary with spend accounting live — the one line in this contract no
# unit test had ever crossed.
[invariant]
runs = 256
depth = 64
fail_on_revert = false
```

`fail_on_revert = false` is correct here: the handler deliberately drives calls that the contract *should* refuse, and a refusal is the behaviour under test, not a failed run.

- [ ] **Step 2: Write the handler**

Create `contracts/test/handlers/AccountHandler.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {SpendPolicyAccount} from "../../src/SpendPolicyAccount.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/**
 * The bounded action surface the invariant runner drives.
 *
 * Every function here is deliberately reachable from a caller the contract may
 * refuse, because a refusal is part of what the invariants assert. The ghost
 * totals are the accounting the contract does not keep: the contract knows
 * today's spend, not the lifetime sum, so an invariant about where value went
 * has to be tracked out here.
 */
contract AccountHandler is CommonBase, StdUtils {
    SpendPolicyAccount public account;
    MockERC20 public token;
    address public owner;
    address public operator;
    address public successor;

    uint256 public ghostFunded;
    uint256 public ghostSpent;
    uint256 public ghostToppedUp;
    uint256 public ghostSwept;

    constructor(
        SpendPolicyAccount _account,
        MockERC20 _token,
        address _owner,
        address _operator,
        address _successor
    ) {
        account = _account;
        token = _token;
        owner = _owner;
        operator = _operator;
        successor = _successor;
    }

    function fund(uint96 amount) external {
        uint256 a = bound(uint256(amount), 1, 1_000e6);
        token.mint(address(account), a);
        ghostFunded += a;
    }

    function execute(uint96 amount, uint8 payeeSeed) external {
        uint256 a = bound(uint256(amount), 1, 100e6);
        address payee = address(uint160(uint256(keccak256(abi.encode(payeeSeed))) | 1));
        vm.prank(operator);
        try account.execute(address(token), payee, a) {
            ghostSpent += a;
        } catch {}
    }

    function topUp(uint96 amount) external {
        uint256 a = bound(uint256(amount), 1, 100e6);
        vm.prank(operator);
        try account.topUpOperator(address(token), a) {
            ghostToppedUp += a;
        } catch {}
    }

    function sweep(uint96 amount) external {
        uint256 a = bound(uint256(amount), 1, 100e6);
        vm.prank(owner);
        try account.sweep(address(token), owner, a) {
            ghostSwept += a;
        } catch {}
    }

    // Owner actions prank account.owner(), not the constructor's `owner`. Once
    // handOver has moved ownership, a fixed prank would be refused on every
    // remaining call, the try/catch would swallow it, and the rest of the run's
    // depth would exercise nothing at all.
    function setPolicy(uint96 perTx, uint96 daily) external {
        vm.prank(account.owner());
        try account.setPolicy(address(token), bound(uint256(perTx), 0, 500e6), bound(uint256(daily), 0, 500e6)) {} catch {}
    }

    function setPaused(bool p) external {
        vm.prank(account.owner());
        try account.setPaused(p) {} catch {}
    }

    function setTopUpEnabled(bool e) external {
        vm.prank(account.owner());
        try account.setTopUpEnabled(e) {} catch {}
    }

    function setAllowlistEnabled(bool e) external {
        vm.prank(account.owner());
        try account.setAllowlistEnabled(e) {} catch {}
    }

    /// Ownership cycles between two addresses this handler can prank as, so the
    /// run always has a reachable owner. Handing it to an address that cannot
    /// sign would freeze every owner action for the rest of the sequence.
    ///
    /// `sweep` always sends to `owner`, never to `operator`, so
    /// invariant_operatorOnlyGainsThroughTopUp still means what it says even
    /// while the operator address holds ownership.
    function handOver() external {
        address current = account.owner();
        address next = current == owner ? successor : owner;
        vm.prank(current);
        try account.transferOwnership(next) {} catch {}
        vm.prank(next);
        try account.acceptOwnership() {} catch {}
    }

    /// A nomination nobody accepts. The invariants must hold while one is
    /// outstanding, which is the state a one-step transfer would not have.
    function nominateAndAbandon(address nominee) external {
        vm.prank(account.owner());
        try account.transferOwnership(nominee) {} catch {}
    }

    /// The reason this handler exists. Everything hard in SpendPolicyAccount is
    /// `l.day == today ? l.spentToday : 0`, and a stateful run that never moves
    /// time never reaches it.
    function warpDay(uint8 days_) external {
        vm.warp(block.timestamp + (uint256(bound(uint256(days_), 1, 3)) * 1 days));
    }

    function warpHours(uint8 hours_) external {
        vm.warp(block.timestamp + (uint256(bound(uint256(hours_), 1, 23)) * 1 hours));
    }
}
```

- [ ] **Step 3: Write the invariants**

Create `contracts/test/Invariants.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {AccountHandler} from "./handlers/AccountHandler.sol";

contract InvariantsTest is Test {
    SpendPolicyAccount account;
    MockERC20 token;
    AccountHandler handler;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);
    // A third address ownership can cycle to. Deliberately not the operator:
    // an operator that also owned the account would make
    // invariant_operatorOnlyGainsThroughTopUp harder to read than the property
    // it is asserting.
    address successor = address(0xF00D);

    function setUp() public {
        vm.startPrank(owner);
        account = new SpendPolicyAccount(owner);
        account.setOperator(operator, true);
        token = new MockERC20();
        account.setPolicy(address(token), 5e6, 10e6);
        vm.stopPrank();

        handler = new AccountHandler(account, token, owner, operator, successor);
        targetContract(address(handler));
    }

    /// Today's spend can never pass the cap that admitted it.
    function invariant_spentTodayNeverExceedsDaily() public view {
        (, uint256 daily, uint256 spentToday, uint64 day) = account.limits(address(token));
        if (day == uint64(block.timestamp / 1 days)) {
            assertLe(spentToday, daily);
        }
    }

    /// Guards the `daily > spent ? daily - spent : 0` branch. An underflow
    /// there would report an enormous allowance on an exhausted account.
    function invariant_remainingNeverExceedsDaily() public view {
        (, uint256 daily,,) = account.limits(address(token));
        assertLe(account.remainingToday(address(token)), daily);
    }

    /// Value leaves by exactly three functions. Anything else means a path
    /// nobody accounted for.
    function invariant_balanceIsFundedMinusWhatLeft() public view {
        assertEq(
            token.balanceOf(address(account)),
            handler.ghostFunded() - handler.ghostSpent() - handler.ghostToppedUp() - handler.ghostSwept()
        );
    }

    /// Nothing reaches the operator's own address except through a top-up the
    /// owner enabled. This is the blocker the switch closes.
    function invariant_operatorOnlyGainsThroughTopUp() public view {
        assertEq(token.balanceOf(operator), handler.ghostToppedUp());
    }

    /// The zero-owner guard and the two-step, together: there is always an
    /// administrator.
    function invariant_ownerIsNeverZero() public view {
        assertTrue(account.owner() != address(0));
    }

    /// A nominee holds no power until it accepts. If this breaks, the two-step
    /// has collapsed into a one-step.
    function invariant_pendingOwnerIsNotTheOwner() public view {
        address pending = account.pendingOwner();
        if (pending != address(0)) {
            assertTrue(pending != account.owner());
        }
    }
}
```

- [ ] **Step 4: Run the invariants**

```bash
cd contracts && forge test --match-path test/Invariants.t.sol -vv
```
Expected: 6 invariants pass, each reporting its calls and reverts.

**If `invariant_balanceIsFundedMinusWhatLeft` fails**, do not weaken the invariant. Read the counterexample sequence forge prints and find which call moved value without a ghost update — that is either a handler bug or a real finding, and the two are told apart by reading the sequence, not by adjusting the assertion.

- [ ] **Step 5: Prove the invariants can actually fail**

An invariant that cannot fail proves nothing. Temporarily change `topUpOperator`'s guard to sit *after* `_consume`, re-run, and confirm a failure appears. Then revert that change and re-run to green. Record what you saw in the commit body.

- [ ] **Step 6: Run the whole suite and commit**

```bash
cd contracts && forge test
```
Expected: 66 passed (60 from Task 2 + 6 invariants).

```bash
cd /Users/vanhuy/Desktop/celo
git add contracts/foundry.toml contracts/test/Invariants.t.sol contracts/test/handlers/AccountHandler.sol
git commit -m "$(cat <<'EOF'
test(contracts): the day rollover had never been crossed with spend accounting live

Thirty-two unit tests and one fuzz file, and none of them moved time inside a
stateful sequence. Everything subtle in this contract is one line —
`l.day == today ? l.spentToday : 0` — and it was reachable only by warping,
which nothing did.

Six invariants, driven by a handler whose actions include warpDay: today's
spend never passes its cap, remainingToday never exceeds daily, the balance
equals funded minus what left, the operator's address gains only through an
enabled top-up, the owner is never address(0), and a nominee is never the
owner.

Checked against the hazard rather than only against itself: moving the
topUpEnabled guard behind _consume makes the invariants fail, so they are known
to be capable of failing.

This is not an audit and README still says the contract is unaudited.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## Task 4: Regenerate the app's ABI and bytecode, and teach the SDK the new revert

**Files:**
- Modify: `app/lib/contract.ts` (regenerated, never hand-edited), `sdk/src/abi.ts`, `sdk/src/policyClient.ts:28-67`
- Test: `sdk/test/` — add cases to the file that already covers `describePreCheckFailure` (find it with `grep -rl describePreCheckFailure sdk/test`)

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: `PreCheckResult` with `error: 'top_up_disabled'`. Task 5 consumes that exact string.

- [ ] **Step 1: Build the contract and regenerate the app's copy**

```bash
cd contracts && forge build
```

`forge build` compiles `script/` as well as `src/`, so a green build is also the
check that `contracts/script/Deploy.s.sol` still compiles. It calls
`new SpendPolicyAccount(owner)` and the constructor kept its single argument, so
it needs no edit — but a build failure here means the constructor changed after
all, and Task 10 would have no working script fallback.

Then regenerate `app/lib/contract.ts`. Read its header comment first — it names `contracts/out` as the source. Produce the file the same way it was produced before (ABI and `bytecode` from `contracts/out/SpendPolicyAccount.sol/SpendPolicyAccount.json`), keeping the existing two-line header comment verbatim.

Verify the regeneration actually happened:

```bash
cd /Users/vanhuy/Desktop/celo
grep -c "transferOwnership\|acceptOwnership\|topUpEnabled\|setTopUpEnabled\|pendingOwner" app/lib/contract.ts
```
Expected: at least 1 (they are on one long line). If 0, the file is stale and Task 10 would deploy v1.

- [ ] **Step 2: Write the failing SDK test**

Add to the test file that covers `describePreCheckFailure`:

```ts
it('names the owner as the only party who can clear a disabled top-up', () => {
  const result = describePreCheckFailure({ name: 'TopUpDisabled', args: [] })
  expect(result).toEqual({ ok: false, error: 'top_up_disabled', spent: 0n, cap: 0n })
})

it('does not invent a cap for a refusal that carried none', () => {
  const result = describePreCheckFailure({ name: 'TopUpDisabled', args: [] })
  if (result.ok) throw new Error('expected a refusal')
  expect(result.cap).toBe(0n)
  expect(result.spent).toBe(0n)
})
```

- [ ] **Step 3: Run it and watch it fail**

```bash
pnpm -F @leash/sdk test
```
Expected: FAIL — `describePreCheckFailure` returns `unknown_policy_error` for an unrecognised name.

- [ ] **Step 4: Add the errors, functions and events to the SDK ABI**

In `sdk/src/abi.ts`, inside `spendPolicyAccountAbi`, add the functions beside `topUpOperator`:

```ts
  {
    type: 'function', name: 'topUpEnabled', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'bool' }],
  },
  {
    type: 'function', name: 'pendingOwner', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address' }],
  },
```

and the errors beside `TransferFailed` — the comment above the error block explains why they must be here, and it applies to these too:

```ts
  { type: 'error', name: 'TopUpDisabled', inputs: [] },
  { type: 'error', name: 'NotPendingOwner', inputs: [] },
  { type: 'error', name: 'ZeroOwner', inputs: [] },
```

- [ ] **Step 5: Add the case to `describePreCheckFailure`**

In `sdk/src/policyClient.ts`, add before `case 'ContractPaused':`:

```ts
    case 'TopUpDisabled':
      // No args, so no figures: this refusal carries none and must not borrow
      // any. Waiting clears nothing — only the owner calling
      // setTopUpEnabled(true) does, which is what pay.ts must say.
      return { ok: false, error: 'top_up_disabled', spent: 0n, cap: 0n }
```

- [ ] **Step 6: Run the SDK tests and typecheck**

```bash
pnpm -F @leash/sdk test && (cd sdk && npx tsc --noEmit) && (cd app && npx tsc --noEmit)
```
Expected: 77 passed, both typechecks exit 0.

- [ ] **Step 7: Run the app suite — the regenerated file may have broken a fixture**

```bash
pnpm -F @leash/app test
```
Expected: 338 passed. If `app/test/deploy.test.ts` fails on a bytecode or ABI assertion, that is the regeneration being noticed, which is correct — update the fixture to the new artefact, never the artefact to the fixture.

- [ ] **Step 8: Commit**

```bash
git add app/lib/contract.ts sdk/src/abi.ts sdk/src/policyClient.ts sdk/test
git commit -m "$(cat <<'EOF'
feat(sdk): a disabled top-up is a refusal with a named owner, not an unknown policy error

forge build regenerates app/lib/contract.ts, and the SDK's hand-written ABI has
to learn the same surface separately or every TopUpDisabled revert decodes to
unknown_policy_error — which leash_pay reports to an agent as a policy refusal
it cannot explain.

The refusal carries no arguments, so it carries no figures, and this returns
none rather than borrowing a cap from a neighbouring branch. That was the
2026-09-05 defect: one `cap` field whose meaning changed with the error,
labelled daily_cap unconditionally.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## Task 5: The agent is told who can lift it, and that waiting will not

**Files:**
- Modify: `mcp/src/tools/pay.ts:32-44` (the `WITHOUT_NUMBERS` map), `sdk/src/x402/index.ts`
- Test: `mcp/test/pay.test.ts`

**Interfaces:**
- Consumes: `error: 'top_up_disabled'` from Task 4.
- Produces: nothing later tasks read.

- [ ] **Step 1: Write the failing test**

Add to `mcp/test/pay.test.ts`, following the construction the file already uses for the other refusals:

```ts
it('tells an agent a disabled top-up needs the owner, not a wait', async () => {
  const result = await refusalFor({ ok: false, error: 'top_up_disabled', spent: 0n, cap: 0n })
  const body = JSON.parse(result.content[0].text)
  expect(body.error).toBe('top_up_disabled')
  expect(body.suggestion).toMatch(/owner/i)
  expect(body.suggestion).toMatch(/setTopUpEnabled/)
  // The kill-switch lesson: never send an agent to sleep against a switch a
  // human threw on purpose.
  expect(body.suggestion).not.toMatch(/midnight/i)
  expect(body).not.toHaveProperty('daily_cap')
  expect(body).not.toHaveProperty('per_tx_cap')
})
```

Use whatever helper the neighbouring refusal tests use to drive `refusal`; read the file rather than assuming a name.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm -F leash-agentpay test
```
Expected: FAIL — `WITHOUT_NUMBERS['top_up_disabled']` is `undefined`, so `suggestion` is undefined.

- [ ] **Step 3: Add the entry**

In `mcp/src/tools/pay.ts`, add to `WITHOUT_NUMBERS`:

```ts
  top_up_disabled:
    'This account does not let the agent draw funds into its own wallet — the owner has agent-funded payments switched off. Only the owner can change it, with setTopUpEnabled; the daily reset does not clear this. Pay the payee directly with leash_pay instead, which is unaffected.',
```

- [ ] **Step 4: Make the x402 draw say the same thing**

In `sdk/src/x402/index.ts`, find the draw step (the comment at `:65` names it). Its failure path must distinguish a disabled switch from a cap: a cap clears at UTC midnight and this does not. Add the branch, matching the surrounding style, so an x402 caller is told the owner must enable the path rather than being told to retry.

- [ ] **Step 5: Check that `leash_fetch` surfaces it too, and needs no edit**

`mcp/src/tools/fetch.ts:114` returns `e.code ?? 'x402_failed'`, so the code it
shows an agent comes from whatever Step 4 threw in the SDK — there is no second
mapping table to update. Confirm that by reading `:104-120`, and add a test in
`mcp/test/fetch.test.ts` asserting that an x402 draw rejected for a disabled
switch reaches the agent as its own code rather than the generic
`x402_failed`. If `fetch.ts` flattens it, fix `fetch.ts`; the generic code is
the one that told a reader the gateway had failed when the policy had refused.

- [ ] **Step 6: Run both suites and typecheck**

```bash
pnpm -F leash-agentpay test && pnpm -F @leash/sdk test && (cd mcp && npx tsc --noEmit) && (cd sdk && npx tsc --noEmit)
```
Expected: mcp 31 passed, sdk 77 passed, both typechecks exit 0.

- [ ] **Step 7: Commit**

```bash
git add mcp/src/tools/pay.ts mcp/src/tools/fetch.ts sdk/src/x402/index.ts mcp/test
git commit -m "$(cat <<'EOF'
fix(mcp): a refusal only the owner can lift must not read like one a wait will clear

The fifth non-cap refusal joins the four that were fixed on 2026-09-05, and for
the same reason: an agent told to wait for the reset at UTC midnight will sleep
and retry against a switch a human set on purpose. Waiting never clears a
disabled top-up; only the owner does.

It also says what still works — paying a payee directly is unaffected — so the
agent has somewhere to go rather than only something to stop doing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## Task 6: Three new events reach the feed instead of being dropped

**Files:**
- Modify: `app/lib/useFeed.ts:10-33` (`EVENT_ABI`), `app/lib/feed.ts:3-11` (`FeedRow`), `:107-115` (`belongsToToken`), `:136-160` (`describeLog`)
- Test: `app/test/feed.test.ts`

**Interfaces:**
- Consumes: the event names from Tasks 1 and 2.
- Produces: `FeedRow['kind']` gains `'ownership'` and `'topUpSwitch'`. Nothing else depends on this.

- [ ] **Step 1: Write the failing tests**

Add to `app/test/feed.test.ts`:

```ts
it('treats ownership and switch events as global, not token-scoped', () => {
  // None of the three carries a `token` field, so the token check would drop
  // them silently — the same shape of bug as a feed that looked quiet.
  expect(belongsToToken('OwnershipTransferStarted', {}, TOKEN)).toBe(true)
  expect(belongsToToken('OwnershipTransferred', {}, TOKEN)).toBe(true)
  expect(belongsToToken('TopUpEnabledSet', {}, TOKEN)).toBe(true)
})

it('describes a completed handover with the address that now owns it', () => {
  const row = describeLog({
    eventName: 'OwnershipTransferred',
    args: { from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222' },
    transactionHash: '0xaa', blockNumber: 1n, logIndex: 0,
  })
  expect(row.kind).toBe('ownership')
  expect(row.text).toContain('0x2222')
  expect(row.amount).toBeNull()
})

it('describes a nomination as pending, not as a handover', () => {
  const row = describeLog({
    eventName: 'OwnershipTransferStarted',
    args: { from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222' },
    transactionHash: '0xab', blockNumber: 1n, logIndex: 0,
  })
  expect(row.kind).toBe('ownership')
  expect(row.text).toMatch(/pending|proposed|nominated/i)
})

it('says which way the top-up switch moved', () => {
  const on = describeLog({
    eventName: 'TopUpEnabledSet', args: { enabled: true },
    transactionHash: '0xac', blockNumber: 1n, logIndex: 0,
  })
  const off = describeLog({
    eventName: 'TopUpEnabledSet', args: { enabled: false },
    transactionHash: '0xad', blockNumber: 1n, logIndex: 0,
  })
  expect(on.kind).toBe('topUpSwitch')
  expect(on.text).not.toBe(off.text)
})
```

Import `TOKEN` or a literal address the way the existing tests in that file do.

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm -F @leash/app test -- feed
```
Expected: FAIL — `belongsToToken` returns false for all three, and `describeLog` falls through to its default branch with `kind: 'policy'`.

- [ ] **Step 3: Widen the `FeedRow` kind**

In `app/lib/feed.ts`:

```ts
export type FeedRow = {
  kind: 'spent' | 'toppedUp' | 'policy' | 'paused' | 'unpaused' | 'ownership' | 'topUpSwitch'
```

- [ ] **Step 4: Make the three global in `belongsToToken`**

```ts
  // These five are account-wide and carry no `token` field. The token check
  // below would drop them silently, which is how a busy account once read as
  // quiet.
  if (
    eventName === 'PausedSet' || eventName === 'OperatorChanged' ||
    eventName === 'OwnershipTransferStarted' || eventName === 'OwnershipTransferred' ||
    eventName === 'TopUpEnabledSet'
  ) return true
```

- [ ] **Step 5: Add the branches to `describeLog`**

Before `default:`:

```ts
    case 'OwnershipTransferStarted':
      return {
        ...base, kind: 'ownership', amount: null,
        text: `Ownership proposed to ${truncateAddress(String(log.args.to))} — pending their acceptance`,
      }
    case 'OwnershipTransferred':
      return {
        ...base, kind: 'ownership', amount: null,
        text: `Ownership transferred to ${truncateAddress(String(log.args.to))}`,
      }
    case 'TopUpEnabledSet':
      return log.args.enabled === true
        ? { ...base, kind: 'topUpSwitch', amount: null, text: 'Agent-funded payments switched on by the owner' }
        : { ...base, kind: 'topUpSwitch', amount: null, text: 'Agent-funded payments switched off by the owner' }
```

- [ ] **Step 6: Add them to the watched ABI**

In `app/lib/useFeed.ts`, add to `EVENT_ABI`:

```ts
  { type: 'event', name: 'OwnershipTransferStarted', inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true }] },
  { type: 'event', name: 'OwnershipTransferred', inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true }] },
  { type: 'event', name: 'TopUpEnabledSet', inputs: [
    { name: 'enabled', type: 'bool', indexed: false }] },
```

Do not touch `CHUNK` or the window constants: the range is already (window ÷ 5,000) sequential round trips and three more event names cost nothing extra in the same calls.

- [ ] **Step 7: Check whether any renderer switches on `kind`**

```bash
grep -rn "kind ===\|row.kind\|case 'spent'" app/components app/app --include='*.tsx' | grep -v node_modules
```

If a component maps `kind` to a colour or an icon, give the two new kinds a treatment consistent with `policy` (an account-management event, not money). Money is `.num`; these rows have `amount: null` and must not render a figure.

- [ ] **Step 8: Run the app suite and typecheck, then commit**

```bash
pnpm -F @leash/app test && (cd app && npx tsc --noEmit)
```
Expected: 342 passed, typecheck exit 0.

```bash
git add app/lib/feed.ts app/lib/useFeed.ts app/test/feed.test.ts app/components
git commit -m "$(cat <<'EOF'
feat(app): a handover and a switched top-up are events an owner can see happen

Three new account-wide events carry no token field, so belongsToToken would
have dropped every one of them before describeLog was reached — silently, which
is exactly how a busy account once read as quiet.

They are carried in the getLogs calls the feed already makes, so the scan costs
nothing extra, and they render with no amount: these are management events, not
money.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## Task 7: The wizard asks the x402 question in the right place, and stops calling the owner permanent

**Files:**
- Modify: `app/app/setup/page.tsx` — `SETUP_ABI` (`:46-63`), stage 1 copy (`:771`), stage 2 (after `:866`), stage 4 `<dl>` (`:1045`)
- Test: `app/test/setup.test.ts`

**Interfaces:**
- Consumes: `setTopUpEnabled` / `topUpEnabled` from Task 2.
- Produces: nothing later tasks read. `app/lib/setup.ts` is **not** modified — the switch is optional exactly as recipient protection is, and recipient protection is not in `SetupReadiness` either.

- [ ] **Step 1: Fix the sentence that v2 makes false**

At `app/app/setup/page.tsx:771`, replace:

> "The owner is permanent. Use a wallet you will keep secure; it must not be the agent wallet."

with wording that says ownership can be handed over later from the dashboard, in two steps, and that it must not be the agent wallet. Keep it inside the prose measure and on an existing type step.

- [ ] **Step 2: Add the two ABI entries**

In `SETUP_ABI`:

```ts
  { type: 'function', name: 'setTopUpEnabled', stateMutability: 'nonpayable',
    inputs: [{ name: 'enabled', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'topUpEnabled', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
```

- [ ] **Step 3: Add the gas constant**

In `app/lib/chain.ts`, beside `SET_ALLOWLIST_ENABLED_GAS`:

```ts
// Same shape of write as SET_ALLOWLIST_ENABLED_GAS: one bool, one event.
// Re-measured against the v2 deployment in Task 11.
export const SET_TOP_UP_ENABLED_GAS = 80_000n
```

- [ ] **Step 4: Write the failing test for the write path's decision**

The button's on-chain call cannot be unit-tested (vitest runs the node environment, which is why `describeDeployReceipt` and `setupReadiness` live in `lib/`). Test the decision instead. Add to `app/test/setup.test.ts`:

```ts
it('summarises the top-up switch for the review screen', () => {
  expect(describeTopUpMode(true)).toBe('On — the agent may draw funds into its own wallet')
  expect(describeTopUpMode(false)).toBe('Off — the agent cannot draw funds into its own wallet')
})
```

- [ ] **Step 5: Run it and watch it fail**

```bash
pnpm -F @leash/app test -- setup
```
Expected: FAIL — `describeTopUpMode` is not exported from `app/lib/setup.ts`.

- [ ] **Step 6: Add the one pure function**

In `app/lib/setup.ts` (this is the *only* change to that file — `setupReadiness` and `firstSetupStage` stay untouched):

```ts
/**
 * What the review screen says about the top-up switch.
 *
 * Here rather than inline in the wizard for the reason the rest of this file
 * exists: app/vitest.config.ts runs the node environment, so a decision inside
 * a component cannot be tested.
 */
export function describeTopUpMode(enabled: boolean): string {
  return enabled
    ? 'On — the agent may draw funds into its own wallet'
    : 'Off — the agent cannot draw funds into its own wallet'
}
```

- [ ] **Step 7: Build the stage 2 block**

Add after the recipient-protection block (closing at `:866`), inside the same stage 2 `Panel`. Copy the shape of the block above it exactly: a `SUBHEAD` heading, an `Optional` `Label`, two `aria-pressed` buttons in `PANEL_GRID` styled with `STATUS_BOX` and `--line-control` when selected, a `role="status"` note coloured by `noteColor`, and `motion-press` plus `focus-ring` on the buttons.

The state and the handler, added beside the recipient ones:

```tsx
  const [topUpEnabled, setTopUpEnabled] = useState(false)
  const [topUpBusy, setTopUpBusy] = useState(false)
  const [topUpNote, setTopUpNote] = useState<string | null>(null)

  async function chooseTopUp(next: boolean) {
    setTopUpNote(null)
    // Before the wallet, never after: a guard that opens a wallet prompt and
    // then refuses leaves a person cancelling a dialogue they did not ask for.
    if (chainId !== REQUIRED_CHAIN_ID) { setTopUpNote(WRONG_NETWORK); return }
    if (next === topUpEnabled) {
      setTopUpNote(next
        ? 'Agent-funded payments are already on — nothing to change.'
        : 'Agent-funded payments are already off — nothing to change.')
      return
    }
    setTopUpBusy(true)
    try {
      try {
        await writeContractAsync({
          address: account!, abi: SETUP_ABI, functionName: 'setTopUpEnabled',
          args: [next], chainId: REQUIRED_CHAIN_ID, gas: SET_TOP_UP_ENABLED_GAS,
        })
      } catch {
        setTopUpNote('The change was not sent.')
        return
      }
      // The condition, not the receipt. forno is load-balanced and serves stale
      // reads after a confirmed transaction.
      const confirmed = await pollUntil(async () => {
        const value = await publicClient.readContract({
          address: account!, abi: SETUP_ABI, functionName: 'topUpEnabled',
        }) as boolean
        return value === next
      })
      if (confirmed) {
        setTopUpEnabled(next)
        setTopUpNote(next
          ? 'Agent-funded payments enabled.'
          : 'Agent-funded payments disabled.')
      } else {
        setTopUpNote('Sent, but the chain has not confirmed it yet. Reload in a moment.')
      }
    } finally { setTopUpBusy(false) }
  }
```

and the block itself, structurally identical to the one above it:

```tsx
          <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 style={SUBHEAD}>Agent-funded payments</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--dim)' }}>Required only for x402 APIs.</p>
              </div>
              <Label>Optional</Label>
            </div>
            <div className={`${PANEL_GRID} mt-4`}>
              <button type="button" aria-pressed={!topUpEnabled} disabled={topUpBusy}
                onClick={() => void chooseTopUp(false)}
                className="motion-press col-span-12 md:col-span-6 p-6 text-left focus-ring disabled:opacity-45"
                style={{ ...STATUS_BOX, borderColor: !topUpEnabled ? 'var(--line-control)' : 'var(--line)', outlineColor: 'var(--text)' }}>
                <span style={SUBHEAD}>Payments only</span>
                <span className="block mt-1" style={{ ...PROSE, color: 'var(--dim)' }}>The agent can pay recipients and nothing else.</span>
              </button>
              <button type="button" aria-pressed={topUpEnabled} disabled={topUpBusy}
                onClick={() => void chooseTopUp(true)}
                className="motion-press col-span-12 md:col-span-6 p-6 text-left focus-ring disabled:opacity-45"
                style={{ ...STATUS_BOX, borderColor: topUpEnabled ? 'var(--line-control)' : 'var(--line)', outlineColor: 'var(--text)' }}>
                <span style={SUBHEAD}>Allow agent-funded</span>
                <span className="block mt-1" style={{ ...PROSE, color: 'var(--dim)' }}>Needed for x402 APIs the agent pays for itself.</span>
              </button>
            </div>
            {topUpNote && <p role="status" className="text-sm mt-3" style={{
              color: noteColor(topUpNote,
                'Agent-funded payments enabled.',
                'Agent-funded payments disabled.',
                'Agent-funded payments are already on — nothing to change.',
                'Agent-funded payments are already off — nothing to change.'),
            }}>{topUpNote}</p>}
          </div>
```

Every string passed to `noteColor` above is load-bearing: a reworded note that is
not in that list renders in `--bad`, which is how a success once turned red.

**Stage 2's Continue button does not change.** It stays `disabled={!limitsConfirmed || !recipientReady || recipientBusy}`: off is a complete, valid state and must not gate the wizard.

Then sharpen the existing red sentence at `:864` so it states the actual state — closed when the switch is off, open and why when it is on — rather than only noting that a gap exists.

- [ ] **Step 8: Add the stage 4 review row**

In the `<dl>` at `:1045`, after the "Direct-payment recipients" row:

```tsx
            <div className="col-span-12"><dt style={{ color: 'var(--dim)' }}>Agent-funded payments</dt>
              <dd className="mt-1">{describeTopUpMode(topUpEnabled)}</dd></div>
```

Import `describeTopUpMode` from `../../lib/setup.js`. `topUpEnabled` is the state the stage 2 block already holds; read it from the chain during the restore effect (the one at `:330` that verifies an account) so a resumed setup shows the true value rather than a default.

- [ ] **Step 9: Run everything the wizard touches**

```bash
pnpm -F @leash/app test && (cd app && npx tsc --noEmit) && pnpm -F @leash/app test:e2e
```
Expected: 343 passed, typecheck exit 0, e2e 41 passed.

**The e2e suite cannot reach this block** — all 41 tests run with no wallet, which pins them to stage 1. What it *does* check is that `/setup` still holds the type scale (`faces.spec.ts` counts rendered faces) and the prose measure (`measure.spec.ts`). If either goes red, the new copy introduced a face or a line length the scale does not allow; fix the copy, not the test.

- [ ] **Step 10: Commit**

```bash
git add app/app/setup/page.tsx app/lib/setup.ts app/lib/chain.ts app/test/setup.test.ts
git commit -m "$(cat <<'EOF'
feat(app): the wizard asks about agent-funded payments where the owner can answer it

The switch was going to be a constructor argument, which would have put a
security question on step 1 — before the owner has set a limit and before they
know whether their agent needs x402 — and would have changed deploy()'s args
and invalidated DEPLOY_GAS. A bool is already false at construction, so the
question moves to step 2 beside recipient protection, the other optional
protection, and the deploy path does not change at all.

Step 1 also stopped claiming "The owner is permanent", which v2 makes false.

setupReadiness is untouched: off is a complete state, exactly as recipient
protection being off is, so it does not gate the wizard.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## Task 8: The dashboard control, including the one affordance a non-owner must see

**Files:**
- Create: `app/components/OwnershipDrawer.tsx`, `app/test/ownership.test.ts`
- Modify: `app/lib/useAccountState.ts:8` (ABI), `:30` (state type), `:51` (initial), `:85-115` (the batched read), `app/app/a/[address]/page.tsx` (mount inside `#agent-management`, `:355`), `app/lib/chain.ts`

**Interfaces:**
- Consumes: `transferOwnership`, `acceptOwnership`, `pendingOwner` from Task 1.
- Produces: `ownershipRole(owner, pendingOwner, connected) → 'owner' | 'incoming' | 'none'`, exported from `app/lib/policy.ts`.

- [ ] **Step 1: Write the failing test for the gate**

Create `app/test/ownership.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ownershipRole } from '../lib/policy.js'

const OWNER = '0x1111111111111111111111111111111111111111'
const INCOMING = '0x2222222222222222222222222222222222222222'
const STRANGER = '0x3333333333333333333333333333333333333333'

describe('ownershipRole', () => {
  it('knows the owner', () => {
    expect(ownershipRole(OWNER, null, OWNER)).toBe('owner')
  })

  // The affordance this exists for: acceptOwnership is the first write in the
  // app whose caller is deliberately NOT the owner. Gating it on isOwner hides
  // it from the only person who can use it.
  it('knows the nominee, who is not the owner', () => {
    expect(ownershipRole(OWNER, INCOMING, INCOMING)).toBe('incoming')
  })

  it('gives a stranger nothing', () => {
    expect(ownershipRole(OWNER, INCOMING, STRANGER)).toBe('none')
  })

  it('gives a disconnected visitor nothing', () => {
    expect(ownershipRole(OWNER, INCOMING, null)).toBe('none')
  })

  it('is case-insensitive, because wallets disagree about checksums', () => {
    expect(ownershipRole(OWNER.toUpperCase(), null, OWNER.toLowerCase())).toBe('owner')
    expect(ownershipRole(OWNER, INCOMING.toUpperCase(), INCOMING.toLowerCase())).toBe('incoming')
  })

  it('prefers owner when the owner is somehow also the nominee', () => {
    expect(ownershipRole(OWNER, OWNER, OWNER)).toBe('owner')
  })

  it('gives nothing when the owner has not been read yet', () => {
    // A read that failed must not promote a visitor. Every gate in this app is
    // a positive observation of the chain.
    expect(ownershipRole(null, null, OWNER)).toBe('none')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm -F @leash/app test -- ownership
```
Expected: FAIL — `ownershipRole` is not exported from `app/lib/policy.ts`.

- [ ] **Step 3: Implement it beside `canEdit`**

In `app/lib/policy.ts`, after `canEdit` (`:99`):

```ts
/**
 * Which ownership affordance a connected wallet gets.
 *
 * `acceptOwnership` is the first write in this app whose caller is deliberately
 * not the owner, so it cannot hang off canEdit. Both values are read from the
 * chain — owner() and pendingOwner() — never from a query parameter: a
 * `?operator=` is only ever a candidate.
 */
export function ownershipRole(
  owner: string | null | undefined,
  pendingOwner: string | null | undefined,
  connected: string | null | undefined,
): 'owner' | 'incoming' | 'none' {
  if (!connected) return 'none'
  if (canEdit(owner, connected)) return 'owner'
  if (canEdit(pendingOwner, connected)) return 'incoming'
  return 'none'
}
```

- [ ] **Step 4: Read `pendingOwner` and `topUpEnabled` inside the existing batch**

In `app/lib/useAccountState.ts`: add both to the ABI at `:8`, add `pendingOwner: \`0x${string}\` | null` and `topUpEnabled: boolean` to the state type at `:30`, add `pendingOwner: null, topUpEnabled: false` to the initial state at `:51`, and add both reads as **elements of the existing `Promise.all` array** at `:85`, destructuring them alongside `owner`.

Do not add an awaited read after the array. The batch is what lets viem multicall these into one request; a sequential read here multiplies requests on every dashboard poll.

- [ ] **Step 5: Add the two gas constants**

In `app/lib/chain.ts`:

```ts
// Both write one address-sized slot and emit one event, which is the shape
// SET_OPERATOR_GAS measures. Re-measured against v2 in Task 11.
export const TRANSFER_OWNERSHIP_GAS = 100_000n
export const ACCEPT_OWNERSHIP_GAS = 100_000n
```

- [ ] **Step 6: Build `OwnershipDrawer.tsx`**

Create `app/components/OwnershipDrawer.tsx`, following `LimitsDrawer` for its shut-by-default disclosure shape, its heading level and its note handling. Its shape:

```tsx
'use client'

import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { publicClient, REQUIRED_CHAIN_ID, WRONG_NETWORK, TRANSFER_OWNERSHIP_GAS, ACCEPT_OWNERSHIP_GAS } from '../lib/chain.js'
import { isValidAddress } from '../lib/address.js'
import { ownershipRole } from '../lib/policy.js'
import { pollUntil } from '../lib/confirm.js'

const OWNERSHIP_ABI = [
  { type: 'function', name: 'transferOwnership', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }], outputs: [] },
  { type: 'function', name: 'acceptOwnership', stateMutability: 'nonpayable',
    inputs: [], outputs: [] },
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pendingOwner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
] as const

const ZERO = '0x0000000000000000000000000000000000000000' as const

type Props = {
  account: `0x${string}`
  owner: `0x${string}` | null
  pendingOwner: `0x${string}` | null
  connected: `0x${string}` | undefined
  onChanged: () => void
}

export default function OwnershipDrawer(
  { account, owner, pendingOwner, connected, onChanged }: Props,
) {
  const role = ownershipRole(owner, pendingOwner, connected)
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // A stranger gets no control at all, not a disabled one. Rendering a dead
  // button tells them something about an account that is none of their
  // business.
  if (role === 'none') return null

  async function write(fn: 'transferOwnership' | 'acceptOwnership', arg: `0x${string}` | null, gas: bigint) {
    setNote(null)
    if (!connected) return
    if (arg !== null && !isValidAddress(arg)) {
      setNote('That is not a valid address.'); return
    }
    setBusy(true)
    try {
      try {
        await writeContractAsync({
          address: account, abi: OWNERSHIP_ABI, functionName: fn,
          ...(arg === null ? {} : { args: [arg] }),
          chainId: REQUIRED_CHAIN_ID, gas,
        } as never)
      } catch {
        setNote('The transaction was not sent.'); return
      }
      const confirmed = await pollUntil(async () => {
        const read = await publicClient.readContract({
          address: account, abi: OWNERSHIP_ABI,
          functionName: fn === 'acceptOwnership' ? 'owner' : 'pendingOwner',
        }) as string
        const want = fn === 'acceptOwnership' ? connected : (arg ?? ZERO)
        return read.toLowerCase() === want.toLowerCase()
      })
      // A receipt is not confirmation. Two implementations of one operation
      // must not disagree about that, so this says the same thing every other
      // write path in this app says.
      setNote(confirmed
        ? (fn === 'acceptOwnership' ? 'You now own this account.' : 'Nomination saved.')
        : 'Sent, but the chain has not confirmed it yet. Reload in a moment.')
      if (confirmed) onChanged()
    } finally { setBusy(false) }
  }

  // role === 'owner': the chain guard must come before the wallet, exactly as
  // the wizard's does.
  // role === 'incoming': one Accept button and the sentence saying this wallet
  // was nominated. No transfer form — a nominee is not yet an owner.
  return role === 'owner' ? ownerBranch() : incomingBranch()
}
```

Fill the two branches following `LimitsDrawer`'s disclosure markup. The owner
branch needs an address field, a Transfer button, and — when `pendingOwner` is
not `ZERO` — the outstanding nomination shown with `Address` plus a Cancel
button calling `write('transferOwnership', ZERO, TRANSFER_OWNERSHIP_GAS)`. Its
copy must say that a transfer hands over `sweep` and every policy control, and
that nothing changes until the nominee accepts. The `chainId !== REQUIRED_CHAIN_ID`
check goes at the top of `write`, before the wallet is touched.

Every note follows the app's existing vocabulary exactly — `'The transaction was not sent.'` when the wallet throws, and `'Sent, but the chain has not confirmed it yet'` when the poll times out. Never report a transfer as done on a receipt alone.

Copy must warn, on the owner branch, that a transfer hands over `sweep` and every policy control, and that the new owner must accept before anything changes.

- [ ] **Step 7: Mount it**

In `app/app/a/[address]/page.tsx`, inside `<div id="agent-management">` (`:355`), mount `OwnershipDrawer` with `owner={state.owner}`, `pendingOwner={state.pendingOwner}`, `connected={connected}`. **Do not wrap it in `{isOwner && …}`** — that is the bug this task exists to avoid, and it would hide Accept from the nominee. The component's own `ownershipRole` decides.

- [ ] **Step 8: Run the app suite, typecheck and e2e**

```bash
pnpm -F @leash/app test && (cd app && npx tsc --noEmit) && pnpm -F @leash/app test:e2e
```
Expected: 350 passed, typecheck exit 0, e2e 41 passed. The four dashboard e2e tests run with no wallet, so `ownershipRole` returns `'none'` and the drawer renders nothing — those assertions must not need changing. If one breaks, the component is rendering something for a disconnected visitor.

- [ ] **Step 9: Commit**

```bash
git add app/components/OwnershipDrawer.tsx app/lib/policy.ts app/lib/useAccountState.ts app/lib/chain.ts app/app/a/\[address\]/page.tsx app/test/ownership.test.ts
git commit -m "$(cat <<'EOF'
feat(app): the one write in this app whose caller is not the owner

acceptOwnership is reached by the nominee, who is not the owner and for whom
isOwner is false. Every other write affordance hangs off canEdit, and reusing
it here would have hidden Accept from the only wallet that can use it.

ownershipRole reads owner() and pendingOwner() off the chain and returns owner,
incoming or none. A stranger gets no control rendered at all rather than a
disabled one, and a failed owner read promotes nobody: the gate is a positive
observation, like every other gate here.

pendingOwner and topUpEnabled join the existing Promise.all in useAccountState
rather than being awaited after it — that batch is what lets viem multicall the
dashboard's reads into one request.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## Task 9: README stops promising what the contract cannot do

**Files:**
- Modify: `README.md` (the "problem" section, around `:36`, and the caveats near `:252`)

**Interfaces:** none.

- [ ] **Step 1: Replace the sentence that is false**

`README.md` currently says:

> A leaked agent key does not become an unbounded one — it becomes a key that can spend at most one day's allowance, only to addresses you named.

Rewrite it so both halves are true: with agent-funded payments off, a leaked key can only reach payees on the allowlist; with them on — which x402 requires — it can also draw one day's allowance into its own wallet, and the allowlist does not apply to that path. Say which is the default.

- [ ] **Step 2: Add the two v2 facts to the caveats**

Beside the existing unaudited disclosure (`:252`), record that ownership is transferable in two steps and that this is migration, not recovery: a key already lost has nobody left to sign with, and an account paused when its key is lost cannot be recovered by anyone.

Keep the "unaudited" paragraph. Update its test count to what `forge test` actually reports (66 after Task 3 — run it, do not copy this number).

- [ ] **Step 3: Verify no other document repeats the false claim**

```bash
grep -rn "only to addresses you named\|only to the addresses" README.md docs/ app/ mcp/ sdk/ --include='*.md' --include='*.ts' --include='*.tsx' | grep -v node_modules
```

Fix every hit the same way. `docs/mcp-setup.md` and `app/components/landing/` are the likely ones.

- [ ] **Step 4: Commit**

```bash
git add README.md docs app
git commit -m "$(cat <<'EOF'
docs: the second half of the headline promise was false, and the app knew it

README said a leaked agent key becomes one that can spend "only to addresses
you named". topUpOperator does not pass through the payee allowlist, so with
any balance present that key could draw a full daily cap to its own address.

The wizard has disclosed this the whole time, in --bad, at two places in
setup/page.tsx. Only the README overclaimed.

It now says which is the default, and what changes when an owner opens the path
for x402. Also records that transferable ownership is migration and not
recovery: a lost key has nobody left to sign with.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

# The mainnet half

**Everything above is free, offline and reversible. Nothing below is.** Before starting Task 10, confirm all of:

```bash
cd contracts && forge test                    # expect 66 passed
cd /Users/vanhuy/Desktop/celo
pnpm -F @leash/sdk test                       # 77
pnpm -F leash-agentpay test                   # 30
pnpm -F @leash/app test                       # 350
pnpm -F @leash/app test:e2e                   # 41
for p in sdk mcp spikes app examples; do (cd $p && npx tsc --noEmit) || echo "FAIL $p"; done
grep -c "setTopUpEnabled" app/lib/contract.ts # must be ≥ 1, or Task 10 deploys v1
git status --short                            # clean
```

---

## Task 10: Deploy v2 through the wizard, and verify its source

**Files:** none in the repo. This task produces an address.

**Interfaces:**
- Consumes: everything above, especially the regenerated `app/lib/contract.ts`.
- Produces: the new account address, used by Tasks 11, 12 and 13.

**This task needs a human at a browser wallet on Celo mainnet. It cannot be scripted.**

- [ ] **Step 1: Fund the wallets**

The maintainer sends **1.00 USDC** to the owner EOA's spending position for the new account and keeps **0.15 USDC** for the operator's gas float. Owner CELO (3.5367) covers every owner write.

Read the balances rather than trusting this line:

```bash
R=https://forno.celo.org; U=0xcebA9300f2b948710d2653dD7B07f33A8B32118C
cast call $U 'balanceOf(address)(uint256)' 0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57 --rpc-url $R
cast balance 0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57 --rpc-url $R
```

- [ ] **Step 2: Deploy through the wizard, not through forge**

```bash
pnpm -F @leash/app dev
```

Open `/setup`, connect the owner wallet, and walk all four stages: deploy, set limits (perTx 0.50, daily 1.00 — matching v1 so the proofs are comparable), authorise the operator `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`, fund, and leave **agent-funded payments off** for now. Task 12 turns it on for the x402 proof, which is how the switch gets proven in both states.

A script would prove the contract. The wizard proves the product, and the regenerated `app/lib/contract.ts` is exactly where a stale-bytecode bug would hide.

- [ ] **Step 3: Confirm on-chain that you deployed v2 and not v1**

```bash
R=https://forno.celo.org; A=<new address>
cast call $A 'owner()(address)' --rpc-url $R
cast call $A 'pendingOwner()(address)' --rpc-url $R      # 0x0…0 — and v1 has no such function
cast call $A 'topUpEnabled()(bool)' --rpc-url $R         # false
```

If `pendingOwner()` reverts, `app/lib/contract.ts` was stale and this is a v1 deployment. Stop, regenerate, and deploy again.

- [ ] **Step 4: Verify the source on Celoscan**

```bash
cd contracts && set -a && . ../.env && set +a
forge verify-contract <new address> src/SpendPolicyAccount.sol:SpendPolicyAccount \
  --chain celo --constructor-args $(cast abi-encode 'constructor(address)' 0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57)
```

Then open the address on celoscan.io and confirm the Contract tab shows source. Without this, README's "Contract: source-verified" badge is false.

- [ ] **Step 5: Record the address where the next task can find it**

Append a dated entry to `docs/deployments.md` with the new address, the deploy transaction, the block, the constructor argument, and the three `cast call` outputs from Step 3 as the evidence that it is v2. Commit that alone — Task 13 does the rest of the migration.

---

## Task 11: Re-measure every gas constant against the new account

**Files:**
- Modify: `app/lib/chain.ts`

- [ ] **Step 1: Measure**

`owner` is now an SLOAD rather than a value in bytecode, so every `onlyOwner` write costs ~2100 more, and `topUpOperator` ~2100 more again. Measure each from the owner EOA against the **new** account:

```bash
R=https://forno.celo.org; A=<new address>; O=0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57
U=0xcebA9300f2b948710d2653dD7B07f33A8B32118C
cast estimate $A 'setPolicy(address,uint256,uint256)' $U 500000 1000000 --from $O --rpc-url $R
cast estimate $A 'setOperator(address,bool)' 0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6 true --from $O --rpc-url $R
cast estimate $A 'setPaused(bool)' true --from $O --rpc-url $R
cast estimate $A 'setTopUpEnabled(bool)' true --from $O --rpc-url $R
cast estimate $A 'setAllowlistEnabled(bool)' true --from $O --rpc-url $R
cast estimate $A 'setAllowlist(address,bool)' $O true --from $O --rpc-url $R
cast estimate $A 'sweep(address,address,uint256)' $U $O 1 --from $O --rpc-url $R
cast estimate $A 'transferOwnership(address)' 0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6 --from $O --rpc-url $R
```

- [ ] **Step 2: Update the constants, keeping the doubling margin**

Each constant stays roughly **double** its measurement. That is not padding for its own sake: these estimates come from an account already in use, and warm storage understates a fresh one by ~17,000 gas per cold slot — and a first-run wizard is the case they have to cover. The existing comment in `app/lib/chain.ts` says this; extend it with today's date and the new figures rather than replacing it.

`ACCEPT_OWNERSHIP_GAS` cannot be estimated from the owner EOA (it would revert — the owner is not the pending owner). Size it from the `transferOwnership` measurement, and say so in a comment.

- [ ] **Step 3: Run and commit**

```bash
pnpm -F @leash/app test && (cd app && npx tsc --noEmit)
git add app/lib/chain.ts
git commit -m "measure(app): every owner write costs more now that owner is a storage slot"
```

---

## Task 12: Earn each proof again

**Files:**
- Modify: `docs/deployments.md`

**This task spends real money.** Every gate is guarded by an explicit environment variable for a reason; do not remove a guard to save a step.

- [ ] **Step 1: The policy gates a spend, and the refusal costs nothing**

One `execute` of 0.01 USDC through the operator, then one deliberately over the per-transaction cap. Read `remainingToday` **at each transaction's own block**, not after the receipt — forno is load-balanced and a receipt proves the transaction landed, never that the next node asked has seen that block. Record both hashes with `tx: ` labels.

- [ ] **Step 2: Zero-CELO gas and attribution, free with the above**

Confirm `cast balance <operator>` is 0 and that the spend still landed. Decode the data suffix of that transaction and confirm `celo_3dec652cd977` round-trips.

- [ ] **Step 3: An MCP agent spends through the policy**

Point a second Claude session's `leash-agentpay` at the new account via `LEASH_ACCOUNT` and have it call `leash_pay`. No human types an amount or a payee. Read the account, the payee and `remainingToday` at that transaction's block.

- [ ] **Step 4: `leash_pay` refuses a disabled top-up, in the agent's own words**

Still with the switch off, drive the x402 draw path and capture the JSON the agent receives. It must name the owner and `setTopUpEnabled`, and must not mention midnight. **This is a free proof** — the refusal sends nothing — and it is the first on-chain-adjacent evidence that Task 5 works.

- [ ] **Step 5: Turn the switch on, then prove x402 Path B**

From the dashboard or the wizard, `setTopUpEnabled(true)`, confirmed by a poll. Then run the x402 gate. The draw must be sized with the buffer that covers its own gas plus a working float — a draw sized to the bare shortfall cannot pay, because it spends its own gas out of the balance it just topped up. Confirm the daily counter fell by exactly the draw.

Remember: x402 has no refunds, and a `5xx` can mean the payment settled. Read the chain before retrying; never retry on a guess. This gate has historically needed two runs.

- [ ] **Step 6: The demo, end to end**

```bash
set -a && . ./.env && set +a
LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm -F @leash/examples demo
```

Three spends and a refusal. Check every printed figure against the chain at that transaction's own block. Budget takes against the daily cap, which resets at UTC midnight on `block.timestamp / 1 days`, not on any wall clock.

- [ ] **Step 7: The live feed, watched by a human**

With the dashboard open and no reload, confirm the rows above appear — including a `TopUpEnabledSet` row from Step 5 and, if Task 8 was exercised, an ownership row. This is the only check Task 6 gets against real traffic.

- [ ] **Step 8: Prove the handover on mainnet, then hand it back**

`transferOwnership` to a second wallet, `acceptOwnership` from it, confirm `owner()` moved, then transfer back. Two cheap writes for the claim that the account can change hands. **Do not skip the hand-back**, and do not nominate an address you cannot sign from.

- [ ] **Step 9: Record it all**

Write each proof into `docs/deployments.md` with its transaction hash — `tx: ` label within 10 characters of the hash, or an explorer URL. State plainly which outcomes were **not** observed rather than implying coverage: `spend_reverted` and `sent_unconfirmed` need a chain that misbehaves on cue and remain unit-tested only.

Do not commit or log a poll URL from the x402 purchase. It is a bearer capability.

```bash
git add docs/deployments.md
git commit -m "docs(deployments): v2 re-proved on mainnet, and which two outcomes still are not"
```

---

## Task 13: Move the address, and mark the old one superseded

**Files:**
- Modify the 17 files that name `0x7aDa926B021BAef4896F51F237bCA61435E43fd2`

- [ ] **Step 1: Find every occurrence — count, do not recall**

```bash
cd /Users/vanhuy/Desktop/celo
grep -rn "0x7aDa926B\|0x7ada926b" --include='*.ts' --include='*.tsx' --include='*.md' --include='*.json' . \
  | grep -v node_modules | grep -v '\.next' | grep -v test-results
```

Expected: 17 files. Both spellings exist — `LiveProof.tsx` uses the checksummed form and `SiteFooter.tsx` the lowercase explorer URL — so a single-case search misses some.

- [ ] **Step 2: Decide per file, do not blanket-replace**

- **Change to the new address:** `app/lib/chain.ts`, `app/components/landing/LiveProof.tsx`, `app/components/landing/SiteFooter.tsx`, `app/app/a/[address]/page.tsx` (`DEMO_ACCOUNT`), `app/e2e/dashboard.spec.ts`, `app/e2e/landing.spec.ts`, `app/test/accountHealth.test.ts`, `app/test/deploy.test.ts`, `app/test/mcpJson.test.ts`, `sdk/test/leashConfirm.test.ts`, `mcp/test/bundle.test.ts`, `README.md` (including the source-verified badge URL).
- **Leave alone:** the three files under `docs/superpowers/plans/`. A plan is a record of what was done at the time, and rewriting one makes it a record of nothing.
- **Add, not replace:** `docs/deployments.md` gains the v2 entry (Task 10 started it) and moves `0x7aDa926B…3fd2` into the superseded section beside `0x895B773Ef…`, saying what superseded it and why. Its existing transaction hashes stay — they are true statements about v1.

- [ ] **Step 3: Update `docs/RESUME.md` and `CLAUDE.md`**

`RESUME.md`: the live-state table, the deployed address, and the superseded list. `CLAUDE.md`: the superseded-address line currently names only `0x895B…`; add the v1 address with the same warning, and update the suite counts to what the runs in this plan actually reported.

Write no ref hashes and no countdown into `RESUME.md`. That file has asserted a wrong push state four times and a wrong day count once.

- [ ] **Step 4: Run everything**

```bash
cd contracts && forge test
cd /Users/vanhuy/Desktop/celo
pnpm -F @leash/sdk test && pnpm -F leash-agentpay test && pnpm -F @leash/app test
pnpm -F @leash/app test:e2e
LEASH_E2E_URL=https://leash-app-phi.vercel.app pnpm -F @leash/app test:e2e
for p in sdk mcp spikes app examples; do (cd $p && npx tsc --noEmit) || echo "FAIL $p"; done
```

The deployed-URL run will fail until the app is redeployed with the new demo address — that is expected and is the signal to deploy. Run it again after.

- [ ] **Step 5: Commit and verify the old address is gone from the live surfaces**

```bash
grep -rn "0x7aDa926B\|0x7ada926b" app/ sdk/src mcp/src README.md | grep -v node_modules | grep -v '\.next'
```
Expected: nothing. Any hit is a live surface still pointing at a superseded contract.

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: the demo account everything points at is the v2 deployment now

SpendPolicyAccount is not upgradeable, so v2 is a different address and
0x7aDa926B...3fd2 joins 0x895B773Ef... as superseded. No funds had to move:
both it and the test account held 0.000000 USDC.

The three plans under docs/superpowers/plans/ keep the old address. A plan
records what was done at the time, and rewriting one makes it a record of
nothing. deployments.md keeps v1's transaction hashes for the same reason —
they are true statements about v1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GGeh6r9nnipvPdgDR1YXJv
EOF
)"
```

---

## What this plan deliberately does not do

- **No factory.** Deterministic addresses and a frontend without deploy bytecode were considered and rejected for this deployment: `app/app/api/accounts/discover/route.ts` finds accounts by scanning direct deployments from the owner EOA, and behind a factory the deployer is the factory. Discovery would have to be rewritten. It stays deferred.
- **No separate caps for `topUpOperator`.** A switch, not a second policy. Spec §4.
- **No ownership UI in the wizard.** Setup creates an account; transferring it is administration, and it lives on the dashboard.
- **No audit.** Task 3 buys invariants. README keeps saying the contract is unaudited.
- **v1 accounts are not migrated.** They cannot be. The project's own test account `0xA73DB76f…F83982` stays on v1 for ever.
