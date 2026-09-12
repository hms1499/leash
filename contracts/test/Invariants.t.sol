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

    /// Once today's spend has reached the cap, nothing further is admitted.
    ///
    /// Deliberately NOT `spentToday <= daily`. The owner may lower a cap below
    /// what has already been spent today -- tightening a policy mid-day -- and
    /// `setPolicy` does not reconcile `spentToday` downward, because doing so
    /// would GRANT allowance rather than remove it. The guarantee the contract
    /// actually makes is that no further spend is admitted, which
    /// `remainingToday` reports as zero. A first draft of this suite asserted
    /// the identity and failed on three ordinary calls with no fuzzing:
    /// execute(1367), then setPolicy(daily = 452).
    function invariant_noAllowanceOnceCapIsReached() public view {
        (, uint256 daily, uint256 spentToday, uint64 day) = account.limits(address(token));
        if (day == uint64(block.timestamp / 1 days) && spentToday >= daily) {
            assertEq(account.remainingToday(address(token)), 0);
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

    /// Ownership moves only through acceptOwnership. If a nomination alone
    /// could move it, the two-step would have collapsed into a one-step, which
    /// is the whole failure mode the second step exists to prevent.
    ///
    /// Deliberately NOT `pendingOwner != owner`. An owner may nominate itself,
    /// which is a harmless no-op -- it already holds every power acceptance
    /// would confer -- and a first draft of this suite failed on exactly that.
    /// The ghost is updated only inside a successful acceptOwnership, so a
    /// nomination nobody accepts cannot satisfy it.
    function invariant_ownerChangesOnlyByAcceptance() public view {
        assertEq(account.owner(), handler.ghostAcceptedOwner());
    }
}
