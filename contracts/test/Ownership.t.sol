// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";

contract OwnershipTest is Test {
    SpendPolicyAccount account;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);
    address stranger = address(0xDEAD);

    function setUp() public {
        vm.prank(owner);
        account = new SpendPolicyAccount(owner);
    }

    function test_ownerIsSetAtConstruction() public view {
        assertEq(account.owner(), owner);
    }

    function test_ownerCanEnableOperator() public {
        vm.prank(owner);
        account.setOperator(operator, true);
        assertTrue(account.operators(operator));
    }

    function test_strangerCannotEnableOperator() public {
        vm.prank(stranger);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.setOperator(operator, true);
    }

    function test_ownerCanPause() public {
        vm.prank(owner);
        account.setPaused(true);
        assertTrue(account.paused());
    }

    function test_strangerCannotPause() public {
        vm.prank(stranger);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.setPaused(true);
    }
}
