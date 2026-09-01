// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract TopUpTest is Test {
    SpendPolicyAccount account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);

    function setUp() public {
        account = new SpendPolicyAccount(owner);
        token = new MockERC20();
        token.mint(address(account), 1_000e6);
        vm.startPrank(owner);
        account.setOperator(operator, true);
        account.setPolicy(address(token), 10e6, 20e6);
        vm.stopPrank();
    }

    function test_topUpMovesFundsToOperator() public {
        vm.prank(operator);
        account.topUpOperator(address(token), 8e6);
        assertEq(token.balanceOf(operator), 8e6);
    }

    function test_topUpConsumesDailyAllowance() public {
        vm.prank(operator);
        account.topUpOperator(address(token), 8e6);
        assertEq(account.remainingToday(address(token)), 12e6);
    }

    function test_topUpIsBoundedByDailyCap() public {
        vm.startPrank(operator);
        account.topUpOperator(address(token), 10e6);
        account.topUpOperator(address(token), 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.DailyCapExceeded.selector, 20e6, 1e6, 20e6)
        );
        account.topUpOperator(address(token), 1e6);
        vm.stopPrank();
    }

    function test_topUpIgnoresAllowlist() public {
        vm.prank(owner);
        account.setAllowlistEnabled(true);
        vm.prank(operator);
        account.topUpOperator(address(token), 5e6);
        assertEq(token.balanceOf(operator), 5e6);
    }

    function test_pausedBlocksTopUp() public {
        vm.prank(owner);
        account.setPaused(true);
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.ContractPaused.selector);
        account.topUpOperator(address(token), 1e6);
    }
}
