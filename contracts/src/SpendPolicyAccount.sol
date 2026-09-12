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

    // Storage, not immutable, so ownership can move. The getter keeps its name
    // and signature, so every read in app/, sdk/ and mcp/ is unaffected.
    //
    // This is migration, not recovery: a key already lost has nobody left to
    // sign transferOwnership. What it buys is rotating a hot wallet to a
    // hardware wallet, handing an account to a colleague, or leaving a wallet
    // you suspect is compromised — none of which used to be possible without
    // redeploying and moving the money.
    address public owner;
    address public pendingOwner;
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

    error ZeroOwner();

    constructor(address _owner) {
        // A fund-holding contract with no administrator is exactly the failure
        // transferable ownership exists to prevent, and v1 accepted it without
        // comment. The wizard always passes the connected wallet, so this is
        // unreachable through the product and reachable by anyone deploying the
        // bytecode directly.
        if (_owner == address(0)) revert ZeroOwner();
        owner = _owner;
    }

    error NotPendingOwner();
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    /// @notice Nominates the next owner. Nothing changes until they accept.
    /// @dev Two steps on purpose. A one-step transfer makes a single mistyped
    ///      character permanent and unrecoverable — strictly worse than an
    ///      immutable owner, where the operator at least drains the balance at
    ///      the daily-cap rate. `to == address(0)` cancels a nomination:
    ///      acceptOwnership can never be reached from the zero address.
    function transferOwnership(address to) external onlyOwner {
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    /// @notice Completes a transfer. Only the nominee can call it, which is
    ///         what makes an address that cannot sign unable to take ownership.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address from = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(from, msg.sender);
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
