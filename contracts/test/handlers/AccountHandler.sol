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

    /// The last owner to have ACCEPTED. Written only inside a successful
    /// acceptOwnership, never by a nomination -- that asymmetry is what lets
    /// invariant_ownerChangesOnlyByAcceptance detect a collapsed two-step.
    address public ghostAcceptedOwner;

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
        ghostAcceptedOwner = _owner;
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
        try account.transferOwnership(next) {} catch { return; }
        vm.prank(next);
        try account.acceptOwnership() { ghostAcceptedOwner = next; } catch {}
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
