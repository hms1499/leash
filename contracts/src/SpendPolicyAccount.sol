// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

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

    error TokenNotConfigured(address token);
    error PerTxCapExceeded(uint256 amount, uint256 cap);
    error DailyCapExceeded(uint256 spentToday, uint256 amount, uint256 cap);

    event PolicyChanged(address indexed token, uint256 perTx, uint256 daily);

    struct Limit {
        uint256 perTx;
        uint256 daily;
        uint256 spentToday;
        uint64 day;
    }

    mapping(address => Limit) public limits;

    function setPolicy(address token, uint256 perTx, uint256 daily) external onlyOwner {
        Limit storage l = limits[token];
        l.perTx = perTx;
        l.daily = daily;
        emit PolicyChanged(token, perTx, daily);
    }

    function _today() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days);
    }

    function remainingToday(address token) public view returns (uint256) {
        Limit storage l = limits[token];
        uint256 spent = l.day == _today() ? l.spentToday : 0;
        return l.daily > spent ? l.daily - spent : 0;
    }

    function _consume(address token, uint256 amount) internal {
        Limit storage l = limits[token];
        if (l.daily == 0) revert TokenNotConfigured(token);
        if (amount > l.perTx) revert PerTxCapExceeded(amount, l.perTx);

        uint64 today = _today();
        uint256 spent = l.day == today ? l.spentToday : 0;
        if (spent + amount > l.daily) revert DailyCapExceeded(spent, amount, l.daily);

        l.spentToday = spent + amount;
        l.day = today;
    }

    error PayeeNotAllowed(address payee);
    error TransferFailed();

    event Spent(address indexed token, address indexed to, uint256 amount, address indexed operator);
    event AllowlistChanged(address indexed payee, bool allowed);
    event AllowlistEnabledSet(bool enabled);
    event ToppedUp(address indexed token, address indexed operator, uint256 amount);

    bool public allowlistEnabled;
    mapping(address => bool) public payeeAllowlist;

    function setAllowlist(address payee, bool allowed) external onlyOwner {
        payeeAllowlist[payee] = allowed;
        emit AllowlistChanged(payee, allowed);
    }

    function setAllowlistEnabled(bool enabled) external onlyOwner {
        allowlistEnabled = enabled;
        emit AllowlistEnabledSet(enabled);
    }

    function execute(address token, address to, uint256 amount)
        external
        onlyOperator
        notPaused
    {
        if (allowlistEnabled && !payeeAllowlist[to]) revert PayeeNotAllowed(to);
        _consume(token, amount);
        if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        emit Spent(token, to, amount, msg.sender);
    }

    /// @notice Moves funds to the operator EOA for flows where the agent must
    ///         sign for itself (x402/EIP-3009). Bounded by the daily cap only —
    ///         the payee allowlist cannot apply once funds leave this contract.
    function topUpOperator(address token, uint256 amount)
        external
        onlyOperator
        notPaused
    {
        _consume(token, amount);
        if (!IERC20(token).transfer(msg.sender, amount)) revert TransferFailed();
        emit ToppedUp(token, msg.sender, amount);
    }

    event Swept(address indexed token, address indexed to, uint256 amount);

    /// @notice Owner escape hatch. Deliberately bypasses policy, the payee
    ///         allowlist and the pause: policy exists to constrain the
    ///         operator, never the owner. Without it, funds held against an
    ///         unconfigured token would be unreachable, and pausing a
    ///         compromised operator would also lock the owner out of the money
    ///         it is trying to protect.
    function sweep(address token, address to, uint256 amount) external onlyOwner {
        if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        emit Swept(token, to, amount);
    }
}
