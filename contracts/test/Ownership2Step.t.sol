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
