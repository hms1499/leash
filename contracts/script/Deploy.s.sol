// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";

/// @notice Deploys SpendPolicyAccount and enables the agent's operator EOA.
///
/// setOperator is onlyOwner, so the broadcasting key must be the owner's. OWNER
/// is read separately rather than taken from the sender: the two are the same
/// today, but a constructor that silently trusts msg.sender is the kind of
/// thing that quietly deploys an account owned by the wrong address.
contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER");
        address operator = vm.envAddress("OPERATOR");

        vm.startBroadcast();
        SpendPolicyAccount account = new SpendPolicyAccount(owner);
        account.setOperator(operator, true);
        vm.stopBroadcast();

        console.log("SpendPolicyAccount:", address(account));
        console.log("owner            :", account.owner());
        console.log("operator enabled :", account.operators(operator));
    }
}
