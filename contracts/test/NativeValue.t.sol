// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";

contract NativeValueTest is Test {
    SpendPolicyAccount account;
    address owner = address(0xA11CE);

    function setUp() public {
        account = new SpendPolicyAccount(owner);
    }

    /// CELO sent here would be unreachable: sweep() moves ERC-20 only and
    /// there is no call{value:} anywhere in the contract. Refusing the
    /// transfer is what keeps a user who was told to "fund your account"
    /// from losing it permanently.
    function test_plainCeloSendReverts() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(account).call{value: 1 ether}("");
        assertFalse(ok, "contract must refuse native value");
        assertEq(address(account).balance, 0);
    }

    /// A call with an unknown selector must also revert: there is no
    /// fallback, and adding one later would reopen the same trap.
    function test_unknownSelectorReverts() public {
        (bool ok,) = address(account).call(abi.encodeWithSignature("nope()"));
        assertFalse(ok, "contract must have no fallback");
    }
}
