// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";

/// The dashboard appends this project's ERC-8021 attribution suffix to every
/// transaction the owner signs, including the deployment itself. Celo Builders
/// credits a signer only from tagged transactions, and a tag cannot be added
/// after a transaction is mined, so an untagged owner is a user who never
/// counted.
///
/// Nothing in the contract changed for this, and nothing may: it is not
/// upgradeable. What these tests pin is the assumption the app now rests on --
/// that 35 trailing bytes change nothing the contract does. For a call that is
/// the ABI decoder ignoring data past its arguments. For the deployment it is
/// less obvious: constructor arguments are read from the tail of the init code,
/// so the suffix lands in the region the constructor decodes.
contract AttributionSuffixTest is Test {
    // `toDataSuffix('celo_3dec652cd977')` from @celo/attribution-tags 0.3.0:
    // the code, its length (0x11), schema 0, and the 16-byte 0x8021 marker.
    // A plain comment, not NatSpec, because NatSpec reads `@celo` as a tag.
    bytes constant SUFFIX =
        hex"63656c6f5f336465633635326364393737110080218021802180218021802180218021";

    address owner = address(0xA11CE);
    address token = address(0x70CE);

    function _deployTagged(address _owner) internal returns (SpendPolicyAccount deployed) {
        bytes memory initCode = abi.encodePacked(
            type(SpendPolicyAccount).creationCode, abi.encode(_owner), SUFFIX
        );
        assembly {
            deployed := create(0, add(initCode, 0x20), mload(initCode))
        }
        require(address(deployed) != address(0), "tagged deployment reverted");
    }

    function test_taggedDeploymentSetsTheOwnerItWasGiven() public {
        SpendPolicyAccount account = _deployTagged(owner);
        assertEq(account.owner(), owner);
    }

    function test_taggedOwnerWriteLandsExactlyAsAnUntaggedOne() public {
        SpendPolicyAccount account = _deployTagged(owner);
        bytes memory data = abi.encodePacked(
            abi.encodeCall(SpendPolicyAccount.setPolicy, (token, 5e5, 2e6)), SUFFIX
        );
        vm.prank(owner);
        (bool ok,) = address(account).call(data);
        assertTrue(ok);
        (uint256 perTx, uint256 daily,,) = account.limits(token);
        assertEq(perTx, 5e5);
        assertEq(daily, 2e6);
    }
}
