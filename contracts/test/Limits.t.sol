// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Exposes the internal accounting so Task 7 is testable without Task 8.
contract ConsumeHarness is SpendPolicyAccount {
    constructor(address _owner) SpendPolicyAccount(_owner) {}

    function consume(address token, uint256 amount) external onlyOperator notPaused {
        _consume(token, amount);
    }
}

contract LimitsTest is Test {
    ConsumeHarness account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);

    function setUp() public {
        account = new ConsumeHarness(owner);
        token = new MockERC20();
        token.mint(address(account), 1_000_000e6);
        vm.startPrank(owner);
        account.setOperator(operator, true);
        account.setPolicy(address(token), 10e6, 20e6);
        vm.stopPrank();
    }

    function test_policyIsStored() public view {
        (uint256 perTx, uint256 daily,,) = account.limits(address(token));
        assertEq(perTx, 10e6);
        assertEq(daily, 20e6);
    }

    function test_remainingStartsAtDailyCap() public view {
        assertEq(account.remainingToday(address(token)), 20e6);
    }

    function test_spendReducesRemaining() public {
        vm.prank(operator);
        account.consume(address(token), 6e6);
        assertEq(account.remainingToday(address(token)), 14e6);
    }

    function test_perTxCapRejectsOversizedSpend() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.PerTxCapExceeded.selector, 11e6, 10e6)
        );
        account.consume(address(token), 11e6);
    }

    function test_dailyCapRejectsThirdSpend() public {
        vm.startPrank(operator);
        account.consume(address(token), 10e6);
        account.consume(address(token), 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.DailyCapExceeded.selector, 20e6, 1e6, 20e6)
        );
        account.consume(address(token), 1e6);
        vm.stopPrank();
    }

    function test_allowanceResetsNextUtcDay() public {
        vm.startPrank(operator);
        account.consume(address(token), 10e6);
        account.consume(address(token), 10e6);
        vm.stopPrank();
        assertEq(account.remainingToday(address(token)), 0);

        vm.warp(block.timestamp + 1 days);
        assertEq(account.remainingToday(address(token)), 20e6);
    }

    function test_unconfiguredTokenCannotBeSpent() public {
        MockERC20 other = new MockERC20();
        other.mint(address(account), 100e6);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.TokenNotConfigured.selector, address(other))
        );
        account.consume(address(other), 1e6);
    }

    /// @dev Spending can never exceed the daily cap, for any split of amounts.
    function testFuzz_neverExceedsDailyCap(uint96 a, uint96 b, uint96 c) public {
        vm.startPrank(operator);
        _trySpend(a);
        _trySpend(b);
        _trySpend(c);
        vm.stopPrank();

        (,, uint256 spentToday,) = account.limits(address(token));
        assertLe(spentToday, 20e6);
    }

    function _trySpend(uint256 amount) internal {
        if (amount == 0) return;
        try account.consume(address(token), amount) {} catch {}
    }
}
