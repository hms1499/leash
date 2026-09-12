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
