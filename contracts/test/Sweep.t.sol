// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SweepTest is Test {
    SpendPolicyAccount account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);

    function setUp() public {
        account = new SpendPolicyAccount(owner);
        token = new MockERC20();
        token.mint(address(account), 100e6);
    }

    /// The escape hatch exists precisely for funds the policy would otherwise
    /// trap: no policy is configured here, so every operator path reverts with
    /// TokenNotConfigured. The owner must still get the money out.
    function test_ownerCanSweepIgnoringPolicy() public {
        vm.prank(owner);
        account.sweep(address(token), owner, 100e6);
        assertEq(token.balanceOf(owner), 100e6);
        assertEq(token.balanceOf(address(account)), 0);
    }

    function test_operatorCannotSweep() public {
        vm.prank(owner);
        account.setOperator(operator, true);
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.sweep(address(token), operator, 1e6);
    }

    /// Pausing is how an owner reacts to a compromised operator. A hatch that
    /// closes at exactly that moment is not a hatch.
    function test_ownerCanSweepWhilePaused() public {
        vm.prank(owner);
        account.setPaused(true);
        vm.prank(owner);
        account.sweep(address(token), owner, 100e6);
        assertEq(token.balanceOf(owner), 100e6);
    }

    /// Sweeping must not touch the daily counter: it is the owner's money
    /// leaving, not the agent's allowance being used.
    function test_sweepDoesNotConsumeDailyAllowance() public {
        vm.startPrank(owner);
        account.setPolicy(address(token), 10e6, 30e6);
        account.setOperator(operator, true);
        account.sweep(address(token), owner, 50e6);
        vm.stopPrank();
        assertEq(account.remainingToday(address(token)), 30e6);
    }
}
