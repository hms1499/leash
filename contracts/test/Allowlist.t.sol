// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract AllowlistTest is Test {
    SpendPolicyAccount account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);
    address allowed = address(0xCAFE);
    address blocked = address(0xBAD);

    function setUp() public {
        account = new SpendPolicyAccount(owner);
        token = new MockERC20();
        token.mint(address(account), 1_000e6);
        vm.startPrank(owner);
        account.setOperator(operator, true);
        account.setPolicy(address(token), 10e6, 20e6);
        vm.stopPrank();
    }

    function test_transfersFundsToPayee() public {
        vm.prank(operator);
        account.execute(address(token), allowed, 5e6);
        assertEq(token.balanceOf(allowed), 5e6);
    }

    function test_emitsSpent() public {
        vm.expectEmit(true, true, true, true);
        emit SpendPolicyAccount.Spent(address(token), allowed, 5e6, operator);
        vm.prank(operator);
        account.execute(address(token), allowed, 5e6);
    }

    function test_nonOperatorCannotSpend() public {
        vm.prank(blocked);
        vm.expectRevert(SpendPolicyAccount.NotOperator.selector);
        account.execute(address(token), allowed, 1e6);
    }

    function test_pausedBlocksSpending() public {
        vm.prank(owner);
        account.setPaused(true);
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.ContractPaused.selector);
        account.execute(address(token), allowed, 1e6);
    }

    function test_executeRespectsDailyCap() public {
        vm.startPrank(operator);
        account.execute(address(token), allowed, 10e6);
        account.execute(address(token), allowed, 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.DailyCapExceeded.selector, 20e6, 1e6, 20e6)
        );
        account.execute(address(token), allowed, 1e6);
        vm.stopPrank();
    }

    function test_allowlistOffPermitsAnyPayee() public {
        vm.prank(operator);
        account.execute(address(token), blocked, 1e6);
        assertEq(token.balanceOf(blocked), 1e6);
    }

    function test_allowlistOnBlocksUnlistedPayee() public {
        vm.startPrank(owner);
        account.setAllowlistEnabled(true);
        account.setAllowlist(allowed, true);
        vm.stopPrank();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.PayeeNotAllowed.selector, blocked)
        );
        account.execute(address(token), blocked, 1e6);
    }

    function test_allowlistOnPermitsListedPayee() public {
        vm.startPrank(owner);
        account.setAllowlistEnabled(true);
        account.setAllowlist(allowed, true);
        vm.stopPrank();

        vm.prank(operator);
        account.execute(address(token), allowed, 1e6);
        assertEq(token.balanceOf(allowed), 1e6);
    }
}
