// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Holds funds for an AI agent and enforces spend policy on-chain.
contract SpendPolicyAccount {
    error NotOwner();
    error NotOperator();
    error ContractPaused();

    event OperatorChanged(address indexed operator, bool enabled);
    event PausedSet(bool paused);

    address public immutable owner;
    bool public paused;
    mapping(address => bool) public operators;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator();
        _;
    }

    modifier notPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    function setOperator(address operator, bool enabled) external onlyOwner {
        operators[operator] = enabled;
        emit OperatorChanged(operator, enabled);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    receive() external payable {}
}
