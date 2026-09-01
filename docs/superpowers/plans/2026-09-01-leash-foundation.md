# Leash Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `SpendPolicyAccount` contract live on Celo mainnet plus a TypeScript SDK that drives it, where every outbound transaction carries a verified ERC-8021 attribution tag and pays gas in a stablecoin from a zero-CELO wallet.

**Architecture:** A single non-upgradeable Solidity contract holds funds and enforces per-token spend limits (per-tx cap, UTC-daily cap, optional payee allowlist). Two spend paths: `execute()` transfers directly to a payee under all three checks; `topUpOperator()` moves funds to the agent's own EOA under the daily cap only, for flows where the agent must sign for itself. A thin viem-based SDK wraps every transaction so attribution tagging and stablecoin gas are applied with no bypass path.

**Tech Stack:** Solidity ^0.8.24 · Foundry (forge/anvil/cast) · TypeScript · viem · Vitest · pnpm workspaces · `@celo/attribution-tags@0.3.0`

**Spec:** `docs/superpowers/specs/2026-09-01-leash-design.md`

## Global Constraints

These apply to every task below.

- **Chain:** Celo mainnet (chain id 42220) for anything that scores. Celo Sepolia is for iteration only; testnet activity counts for nothing.
- **Attribution:** every outbound transaction sent by our code carries `toDataSuffix(attributionTag)`. There must be no code path that sends a transaction without it.
- **Attribution tag value:** the `celo_` + 12 hex string returned by celobuilders at registration. It is derived from the GitHub `owner/repo` slug and locked at first save. A self-derived code is not credited.
- **`agentWalletAddress` registered with celobuilders MUST be the operator EOA**, never the contract address. Getting this wrong silently voids all x402 attribution.
- **Gas:** the operator EOA holds zero CELO. All transactions set `feeCurrency` to a whitelisted stablecoin adapter read from the on-chain `FeeCurrencyDirectory`. Never hardcode adapter addresses from memory.
- **Cap denomination:** per-token (`mapping(address => Limit)`). No oracle, no cross-token conversion in the contract.
- **Daily window:** UTC calendar day, computed as `block.timestamp / 1 days`. Not a rolling 24h window.
- **Custody:** funds live in the contract. No allowance-from-owner-EOA pattern.
- **Failure mode:** policy violations `revert` with custom errors. Never return false silently.
- **Repo:** public on GitHub from the moment of registration, and must still resolve at judging.
- **Git:** work directly on `main`. Solo project, no branching.
- **Solidity version:** pin `^0.8.24` in every contract file and in `foundry.toml`.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `README.md`
- Create: `spikes/package.json`, `spikes/tsconfig.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: a pnpm workspace where `spikes/`, `sdk/`, and `contracts/` resolve as packages; `pnpm -F spikes exec tsx <file>` runs a TypeScript script.

- [ ] **Step 1: Create the workspace root**

`package.json`:
```json
{
  "name": "leash",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "sdk"
  - "mcp"
  - "app"
  - "spikes"
```

`.nvmrc`:
```
20
```

- [ ] **Step 2: Create the spikes package**

`spikes/package.json`:
```json
{
  "name": "spikes",
  "private": true,
  "type": "module",
  "dependencies": {
    "@celo/attribution-tags": "0.3.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

`spikes/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 3: Install and verify the workspace resolves**

Run: `pnpm install`
Expected: completes without error, `spikes/node_modules` exists.

Run: `pnpm -F spikes exec tsx --version`
Expected: prints a version number.

- [ ] **Step 4: Write the README**

`README.md`:
```markdown
# Leash

Give an AI agent a wallet without trusting it. Spend limits and payee
allowlists are enforced on-chain, not by a prompt.

Built for the Celo "Agents at Work" hackathon.

## Packages

- `contracts/` — Foundry. `SpendPolicyAccount`, the on-chain policy engine.
- `sdk/` — TypeScript client. Attribution tagging, stablecoin gas, policy reads.
- `mcp/` — MCP server so any agent can spend through the leash.
- `app/` — Next.js UI.
- `spikes/` — throwaway scripts that verify chain-level assumptions.

## Design

See `docs/superpowers/specs/2026-09-01-leash-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml .nvmrc README.md .gitignore spikes/
git commit -m "chore: scaffold pnpm monorepo"
```

---

### Task 2: Spike T0.1 — stablecoin gas from a zero-CELO wallet

This spike answers: can an EOA holding **zero CELO** send a transaction on Celo mainnet by paying gas in a stablecoin? The whole "the agent never holds CELO" pitch depends on the answer.

**Files:**
- Create: `spikes/fee-currency.ts`
- Create: `spikes/README.md`
- Create: `sdk/src/constants.ts` (written by this task, consumed by Task 12)

**Interfaces:**
- Consumes: nothing
- Produces: `sdk/src/constants.ts` exporting `FEE_CURRENCY_DIRECTORY: \`0x${string}\`` and `KNOWN_FEE_ADAPTERS: readonly \`0x${string}\`[]` — the real, on-chain-discovered values.

- [ ] **Step 1: Find the FeeCurrencyDirectory address**

Do NOT guess this address. Get it from the Celo registry or docs, then confirm on-chain that it responds:

```bash
# Replace <DIR> with the candidate address from Celo docs.
cast call <DIR> "getCurrencies()(address[])" --rpc-url https://forno.celo.org
```

Expected: returns a non-empty address array. If it reverts, the address is wrong — find the correct one before continuing.

- [ ] **Step 2: Write the discovery spike**

`spikes/fee-currency.ts`:
```ts
import { createPublicClient, http, parseAbi } from 'viem'
import { celo } from 'viem/chains'

const DIRECTORY = process.env.FEE_CURRENCY_DIRECTORY as `0x${string}`
if (!DIRECTORY) throw new Error('set FEE_CURRENCY_DIRECTORY')

const abi = parseAbi([
  'function getCurrencies() view returns (address[])',
])

const client = createPublicClient({ chain: celo, transport: http() })

const currencies = await client.readContract({
  address: DIRECTORY,
  abi,
  functionName: 'getCurrencies',
})

console.log('whitelisted fee currencies:', currencies)
```

- [ ] **Step 3: Run it and record the real list**

Run: `FEE_CURRENCY_DIRECTORY=<DIR> pnpm -F spikes exec tsx fee-currency.ts`
Expected: prints an array of adapter addresses.

Record the output. These are the only values allowed in `sdk/src/constants.ts`.

- [ ] **Step 4: Send a real transaction from a zero-CELO wallet**

Fund a fresh EOA with a small amount of a whitelisted stablecoin and **no CELO**. Then:

```bash
cast send <ANY_RECIPIENT> --value 0 \
  --fee-currency <ADAPTER_FROM_STEP_3> \
  --private-key $SPIKE_PK \
  --rpc-url https://forno.celo.org
```

Expected: transaction succeeds. Confirm on Celoscan that the sender's CELO balance was and remains zero.

**If this fails:** stop and report. The "zero CELO" pitch does not hold and the spec's section 2.5 needs rewriting before any further work.

- [ ] **Step 5: Write the discovered constants**

`sdk/src/constants.ts` — fill in with the values actually observed in Steps 1 and 3:
```ts
/** Discovered on-chain by spikes/fee-currency.ts. Do not edit by hand. */
export const FEE_CURRENCY_DIRECTORY = '0x...' as const
export const KNOWN_FEE_ADAPTERS = ['0x...'] as const
```

- [ ] **Step 6: Record the finding**

`spikes/README.md`:
```markdown
# Spikes

Throwaway scripts that verify chain-level assumptions. Findings are recorded
here; the code is not production code.

## T0.1 — stablecoin gas from a zero-CELO wallet

Result: <PASS or FAIL>
FeeCurrencyDirectory: <address>
Adapters discovered: <list>
Proof tx: <celoscan link>
```

- [ ] **Step 7: Commit**

```bash
git add spikes/ sdk/src/constants.ts
git commit -m "spike: verify stablecoin gas from zero-CELO wallet"
```

---

### Task 3: Spike T0.3 — attribution tag round-trip

This spike answers: does a tag survive being written into a transaction and read back out? If it does not, every track scores zero.

**Files:**
- Create: `spikes/attribution.ts`
- Modify: `spikes/README.md`

**Interfaces:**
- Consumes: `sdk/src/constants.ts` from Task 2
- Produces: a confirmed working call pattern for `toDataSuffix` / `verifyTx`, reused verbatim in Task 11.

- [ ] **Step 1: Write the round-trip spike**

`spikes/attribution.ts`:
```ts
import { toDataSuffix, verifyTx, fromDataSuffix } from '@celo/attribution-tags'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'

const TAG = process.env.ATTRIBUTION_TAG!
const PK = process.env.SPIKE_PK as `0x${string}`
const ADAPTER = process.env.FEE_ADAPTER as `0x${string}`

const suffix = toDataSuffix(TAG)
console.log('suffix:', suffix)
console.log('offline decode:', fromDataSuffix(suffix))

const account = privateKeyToAccount(PK)
const wallet = createWalletClient({ account, chain: celo, transport: http() })
const pub = createPublicClient({ chain: celo, transport: http() })

const hash = await wallet.sendTransaction({
  to: account.address,
  value: 0n,
  data: suffix,
  feeCurrency: ADAPTER,
})
console.log('tx:', hash)

await pub.waitForTransactionReceipt({ hash })
const result = await verifyTx({ client: pub, hash })
console.log('verifyTx:', result)

if (!result?.codes.includes(TAG)) {
  throw new Error(`tag ${TAG} NOT found in ${JSON.stringify(result)}`)
}
console.log('ROUND TRIP OK')
```

- [ ] **Step 2: Run it against mainnet**

Run:
```bash
ATTRIBUTION_TAG=<tag from Task 5> SPIKE_PK=<key> FEE_ADAPTER=<adapter> \
  pnpm -F spikes exec tsx attribution.ts
```
Expected: prints `ROUND TRIP OK`.

Note: this task depends on having a real tag, so it runs after Task 5. Until then, run it with a placeholder tag against Celo Sepolia to validate the code path, then re-run on mainnet with the real tag.

- [ ] **Step 3: Record the finding**

Append to `spikes/README.md`:
```markdown
## T0.3 — attribution tag round-trip

Result: <PASS or FAIL>
Tag: <celo_...>
Proof tx: <celoscan link>
verifyTx output: <codes array>
```

- [ ] **Step 4: Commit**

```bash
git add spikes/
git commit -m "spike: verify attribution tag round-trip on mainnet"
```

---

### Task 4: Spike T0.2 — can a contract account pay x402?

This spike answers the fork in the road. x402 settles via EIP-3009 `transferWithAuthorization`, which is signed off-chain by the payer. A contract cannot produce an ECDSA signature, so this only works if the token accepts ERC-1271 contract signatures.

**Files:**
- Create: `spikes/x402-contract-signature.ts`
- Modify: `spikes/README.md`

**Interfaces:**
- Consumes: nothing
- Produces: a recorded PASS/FAIL that decides whether Plan 2 routes x402 through Path A or Path B.

- [ ] **Step 1: Inspect the token's verification path**

Read the deployed stablecoin's `transferWithAuthorization` implementation on Celoscan. Determine whether it calls `ecrecover` directly or delegates to an ERC-1271 `isValidSignature` check when the payer is a contract.

Record which one it is. This alone usually answers the question.

- [ ] **Step 2: Write an empirical check**

`spikes/x402-contract-signature.ts`:
```ts
import { createPublicClient, http, parseAbi } from 'viem'
import { celo } from 'viem/chains'

const TOKEN = process.env.TOKEN as `0x${string}`

const client = createPublicClient({ chain: celo, transport: http() })

// EIP-3009 tokens expose these; ERC-1271 support is not part of the standard.
const abi = parseAbi([
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
])

console.log('domain separator:', await client.readContract({
  address: TOKEN, abi, functionName: 'DOMAIN_SEPARATOR',
}))
console.log('token exposes EIP-3009 surface: true')
console.log('Now confirm from the verified source whether signature recovery')
console.log('is ecrecover-only (contract accounts cannot pay) or ERC-1271-aware.')
```

- [ ] **Step 3: Run it**

Run: `TOKEN=<stablecoin address> pnpm -F spikes exec tsx x402-contract-signature.ts`
Expected: prints a domain separator, confirming the EIP-3009 surface exists.

- [ ] **Step 4: Record the decision**

Append to `spikes/README.md`:
```markdown
## T0.2 — can a contract account sign EIP-3009 for x402?

Result: <ERC-1271 SUPPORTED | ECRECOVER ONLY>
Token inspected: <address>
Evidence: <link to verified source, line reference>

Consequence:
- ERC-1271 SUPPORTED -> Path A covers x402. Update spec section 2.1.
- ECRECOVER ONLY     -> Path B (metered top-up) is the x402 route, as designed.
```

- [ ] **Step 5: Commit**

```bash
git add spikes/
git commit -m "spike: determine x402 signing path for contract accounts"
```

---

### Task 5: Register with celobuilders and obtain the attribution tag

Not code, but it blocks scoring: transactions sent before the tag exists are permanently uncounted. Do this on day one.

**Files:**
- Create: `docs/registration.md`

**Interfaces:**
- Consumes: nothing
- Produces: the `attributionTag` string consumed by Tasks 3, 11, and 14; and the operator EOA address registered as `agentWalletAddress`.

- [ ] **Step 1: Push the repo to GitHub as public**

```bash
gh repo create leash --public --source=. --remote=origin --push
```
Expected: repo exists and its URL resolves in a browser while logged out.

- [ ] **Step 2: Create the operator EOA and record it**

Generate a fresh key. This address is the **operator EOA** — the wallet the agent transacts from. It is what gets registered as `agentWalletAddress`, and it is NOT the contract address (the contract does not exist yet).

- [ ] **Step 3: Create the ERC-8004 identity**

Register the agent identity and capture the resulting URL, which must be on one of the accepted hosts: `8004scan.io` or `celoscan.io`.

- [ ] **Step 4: Register via the celo-builders skill**

Registration requires: `projectName`, public `githubUrl`, personal `telegram`, `primaryTrack` (`judges-favorite`), `erc8004Url`, `agentWalletAddress`. Also tick `cpayBetaOptIn`.

- [ ] **Step 5: Record the returned values**

`docs/registration.md`:
```markdown
# Registration

- Hackathon: agents-at-work
- Primary track: judges-favorite
- Secondary track: askbots-growth ("what I will demonstrate": measured code-quality
  improvement between AskBots review rounds one and two on the Leash repo)
- Attribution tag: <celo_xxxxxxxxxxxx>
- Operator EOA (= registered agentWalletAddress): <0x...>
- ERC-8004 identity: <url>
- Repo: <github url>
- Registered at: <timestamp>
```

- [ ] **Step 6: Commit**

```bash
git add docs/registration.md
git commit -m "docs: record hackathon registration and attribution tag"
```

---

### Task 6: SpendPolicyAccount — storage, ownership, pause

**Files:**
- Create: `contracts/foundry.toml`
- Create: `contracts/src/SpendPolicyAccount.sol`
- Create: `contracts/test/Ownership.t.sol`
- Create: `contracts/test/mocks/MockERC20.sol`

**Interfaces:**
- Consumes: nothing
- Produces: `SpendPolicyAccount` with `owner() -> address`, `paused() -> bool`, `operators(address) -> bool`, `setOperator(address,bool)`, `setPaused(bool)`, and modifiers `onlyOwner` / `onlyOperator` / `notPaused` used by Tasks 7-9.

- [ ] **Step 1: Initialise Foundry**

```bash
forge init contracts --no-git --no-commit
rm -rf contracts/src/Counter.sol contracts/test/Counter.t.sol contracts/script/Counter.s.sol
```

`contracts/foundry.toml`:
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.24"
optimizer = true
optimizer_runs = 200

[rpc_endpoints]
celo = "https://forno.celo.org"
celo_sepolia = "https://forno.celo-sepolia.celo-testnet.org"
```

- [ ] **Step 2: Write the failing test**

`contracts/test/mocks/MockERC20.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockERC20 {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
```

`contracts/test/Ownership.t.sol`:
```solidity
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd contracts && forge test --match-contract OwnershipTest`
Expected: FAIL — `SpendPolicyAccount.sol` does not exist yet.

- [ ] **Step 4: Write the minimal implementation**

`contracts/src/SpendPolicyAccount.sol`:
```solidity
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd contracts && forge test --match-contract OwnershipTest -vv`
Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add contracts/
git commit -m "feat(contracts): SpendPolicyAccount ownership and pause"
```

---

### Task 7: Daily window and limit accounting

The riskiest arithmetic in the project. It gets its own task and its own fuzz test.

**Files:**
- Modify: `contracts/src/SpendPolicyAccount.sol`
- Create: `contracts/test/Limits.t.sol`

**Interfaces:**
- Consumes: `SpendPolicyAccount` from Task 6
- Produces: `struct Limit { uint256 perTx; uint256 daily; uint256 spentToday; uint64 day; }`, `limits(address token) -> Limit`, `setPolicy(address token, uint256 perTx, uint256 daily)`, `remainingToday(address token) -> uint256`, and internal `_consume(address token, uint256 amount)` used by Tasks 8 and 9.

- [ ] **Step 1: Write the failing test**

`contracts/test/Limits.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Exposes the internal accounting so Task 7 is testable without Task 8.
contract ConsumeHarness is SpendPolicyAccount {
    constructor(address _owner) SpendPolicyAccount(_owner) {}

    function consume(address token, uint256 amount) external onlyOperator notPaused {
        _consume(token, amount);
    }
}

contract LimitsTest is Test {
    ConsumeHarness account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);

    function setUp() public {
        account = new ConsumeHarness(owner);
        token = new MockERC20();
        token.mint(address(account), 1_000_000e6);
        vm.startPrank(owner);
        account.setOperator(operator, true);
        account.setPolicy(address(token), 10e6, 20e6);
        vm.stopPrank();
    }

    function test_policyIsStored() public view {
        (uint256 perTx, uint256 daily,,) = account.limits(address(token));
        assertEq(perTx, 10e6);
        assertEq(daily, 20e6);
    }

    function test_remainingStartsAtDailyCap() public view {
        assertEq(account.remainingToday(address(token)), 20e6);
    }

    function test_spendReducesRemaining() public {
        vm.prank(operator);
        account.consume(address(token), 6e6);
        assertEq(account.remainingToday(address(token)), 14e6);
    }

    function test_perTxCapRejectsOversizedSpend() public {
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.PerTxCapExceeded.selector, 11e6, 10e6)
        );
        account.consume(address(token), 11e6);
    }

    function test_dailyCapRejectsThirdSpend() public {
        vm.startPrank(operator);
        account.consume(address(token), 10e6);
        account.consume(address(token), 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.DailyCapExceeded.selector, 20e6, 1e6, 20e6)
        );
        account.consume(address(token), 1e6);
        vm.stopPrank();
    }

    function test_allowanceResetsNextUtcDay() public {
        vm.prank(operator);
        account.consume(address(token), 20e6);
        assertEq(account.remainingToday(address(token)), 0);

        vm.warp(block.timestamp + 1 days);
        assertEq(account.remainingToday(address(token)), 20e6);
    }

    function test_unconfiguredTokenCannotBeSpent() public {
        MockERC20 other = new MockERC20();
        other.mint(address(account), 100e6);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.TokenNotConfigured.selector, address(other))
        );
        account.consume(address(other), 1e6);
    }

    /// @dev Spending can never exceed the daily cap, for any split of amounts.
    function testFuzz_neverExceedsDailyCap(uint96 a, uint96 b, uint96 c) public {
        vm.startPrank(operator);
        _trySpend(a);
        _trySpend(b);
        _trySpend(c);
        vm.stopPrank();

        (,, uint256 spentToday,) = account.limits(address(token));
        assertLe(spentToday, 20e6);
    }

    function _trySpend(uint256 amount) internal {
        if (amount == 0) return;
        try account.consume(address(token), amount) {} catch {}
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd contracts && forge test --match-contract LimitsTest`
Expected: FAIL — `setPolicy`, `limits`, and `remainingToday` are undefined.

- [ ] **Step 3: Add limit storage and accounting**

Insert into `contracts/src/SpendPolicyAccount.sol`, above `receive()`:
```solidity
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
```

Note: `setPolicy` deliberately does not reset `spentToday`. Raising the cap mid-day grants the difference; it does not grant a fresh full allowance.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd contracts && forge test --match-contract LimitsTest -vv`
Expected: all 8 tests PASS, including `testFuzz_neverExceedsDailyCap`.

- [ ] **Step 5: Commit**

```bash
git add contracts/
git commit -m "feat(contracts): per-token limits with UTC daily window"
```

---

### Task 8: Path A — `execute()` with allowlist

**Files:**
- Modify: `contracts/src/SpendPolicyAccount.sol`
- Create: `contracts/test/Allowlist.t.sol`

**Interfaces:**
- Consumes: `_consume` from Task 7, `onlyOperator` / `notPaused` from Task 6
- Produces: `execute(address token, address to, uint256 amount)`, `setAllowlist(address payee, bool allowed)`, `setAllowlistEnabled(bool)`, `payeeAllowlist(address) -> bool`, event `Spent(address indexed token, address indexed to, uint256 amount, address indexed operator)`.

**Scope note:** the spec's section 2.1 describes Path A as covering "stablecoin transfers, contract calls". This task implements transfers only. Arbitrary contract calls need an approve-call-reset pattern that does not fit the 6h budget for `T1.1` and no v1 flow requires it. Recorded as a deliberate reduction, not an omission.

- [ ] **Step 1: Write the failing test**

`contracts/test/Allowlist.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract AllowlistTest is Test {
    SpendPolicyAccount account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);
    address allowed = address(0xCAFE);
    address blocked = address(0xBAD);

    function setUp() public {
        account = new SpendPolicyAccount(owner);
        token = new MockERC20();
        token.mint(address(account), 1_000e6);
        vm.startPrank(owner);
        account.setOperator(operator, true);
        account.setPolicy(address(token), 10e6, 20e6);
        vm.stopPrank();
    }

    function test_transfersFundsToPayee() public {
        vm.prank(operator);
        account.execute(address(token), allowed, 5e6);
        assertEq(token.balanceOf(allowed), 5e6);
    }

    function test_emitsSpent() public {
        vm.expectEmit(true, true, true, true);
        emit SpendPolicyAccount.Spent(address(token), allowed, 5e6, operator);
        vm.prank(operator);
        account.execute(address(token), allowed, 5e6);
    }

    function test_nonOperatorCannotSpend() public {
        vm.prank(blocked);
        vm.expectRevert(SpendPolicyAccount.NotOperator.selector);
        account.execute(address(token), allowed, 1e6);
    }

    function test_pausedBlocksSpending() public {
        vm.prank(owner);
        account.setPaused(true);
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.ContractPaused.selector);
        account.execute(address(token), allowed, 1e6);
    }

    function test_executeRespectsDailyCap() public {
        vm.startPrank(operator);
        account.execute(address(token), allowed, 10e6);
        account.execute(address(token), allowed, 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.DailyCapExceeded.selector, 20e6, 1e6, 20e6)
        );
        account.execute(address(token), allowed, 1e6);
        vm.stopPrank();
    }

    function test_allowlistOffPermitsAnyPayee() public {
        vm.prank(operator);
        account.execute(address(token), blocked, 1e6);
        assertEq(token.balanceOf(blocked), 1e6);
    }

    function test_allowlistOnBlocksUnlistedPayee() public {
        vm.startPrank(owner);
        account.setAllowlistEnabled(true);
        account.setAllowlist(allowed, true);
        vm.stopPrank();

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.PayeeNotAllowed.selector, blocked)
        );
        account.execute(address(token), blocked, 1e6);
    }

    function test_allowlistOnPermitsListedPayee() public {
        vm.startPrank(owner);
        account.setAllowlistEnabled(true);
        account.setAllowlist(allowed, true);
        vm.stopPrank();

        vm.prank(operator);
        account.execute(address(token), allowed, 1e6);
        assertEq(token.balanceOf(allowed), 1e6);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd contracts && forge test --match-contract AllowlistTest`
Expected: FAIL — `execute`, `setAllowlist`, `setAllowlistEnabled` undefined.

- [ ] **Step 3: Implement Path A**

Add to `contracts/src/SpendPolicyAccount.sol`:
```solidity
    error PayeeNotAllowed(address payee);
    error TransferFailed();

    event Spent(address indexed token, address indexed to, uint256 amount, address indexed operator);
    event AllowlistChanged(address indexed payee, bool allowed);
    event AllowlistEnabledSet(bool enabled);

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
```

Add at the top of the file, after the pragma:
```solidity
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
```

- [ ] **Step 4: Run the full contract test suite**

Run: `cd contracts && forge test -vv`
Expected: all of `OwnershipTest`, `LimitsTest`, and `AllowlistTest` PASS, including the fuzz test.

- [ ] **Step 5: Commit**

```bash
git add contracts/
git commit -m "feat(contracts): Path A execute with payee allowlist"
```

---

### Task 9: Path B — `topUpOperator()`

**Files:**
- Modify: `contracts/src/SpendPolicyAccount.sol`
- Create: `contracts/test/TopUp.t.sol`

**Interfaces:**
- Consumes: `_consume` from Task 7
- Produces: `topUpOperator(address token, uint256 amount)`, event `ToppedUp(address indexed token, address indexed operator, uint256 amount)`.

- [ ] **Step 1: Write the failing test**

`contracts/test/TopUp.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract TopUpTest is Test {
    SpendPolicyAccount account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);

    function setUp() public {
        account = new SpendPolicyAccount(owner);
        token = new MockERC20();
        token.mint(address(account), 1_000e6);
        vm.startPrank(owner);
        account.setOperator(operator, true);
        account.setPolicy(address(token), 10e6, 20e6);
        vm.stopPrank();
    }

    function test_topUpMovesFundsToOperator() public {
        vm.prank(operator);
        account.topUpOperator(address(token), 8e6);
        assertEq(token.balanceOf(operator), 8e6);
    }

    function test_topUpConsumesDailyAllowance() public {
        vm.prank(operator);
        account.topUpOperator(address(token), 8e6);
        assertEq(account.remainingToday(address(token)), 12e6);
    }

    function test_topUpIsBoundedByDailyCap() public {
        vm.startPrank(operator);
        account.topUpOperator(address(token), 10e6);
        account.topUpOperator(address(token), 10e6);
        vm.expectRevert(
            abi.encodeWithSelector(SpendPolicyAccount.DailyCapExceeded.selector, 20e6, 1e6, 20e6)
        );
        account.topUpOperator(address(token), 1e6);
        vm.stopPrank();
    }

    function test_topUpIgnoresAllowlist() public {
        vm.prank(owner);
        account.setAllowlistEnabled(true);
        vm.prank(operator);
        account.topUpOperator(address(token), 5e6);
        assertEq(token.balanceOf(operator), 5e6);
    }

    function test_pausedBlocksTopUp() public {
        vm.prank(owner);
        account.setPaused(true);
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.ContractPaused.selector);
        account.topUpOperator(address(token), 1e6);
    }
}
```

`test_topUpIgnoresAllowlist` encodes the documented weaker guarantee of Path B: once funds reach the operator EOA the allowlist no longer applies. It is a test, not a bug.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd contracts && forge test --match-contract TopUpTest`
Expected: FAIL — `topUpOperator` undefined.

- [ ] **Step 3: Implement Path B**

Add to `contracts/src/SpendPolicyAccount.sol`:
```solidity
    event ToppedUp(address indexed token, address indexed operator, uint256 amount);

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
```

- [ ] **Step 4: Run the full suite**

Run: `cd contracts && forge test -vv`
Expected: all four test contracts PASS.

- [ ] **Step 5: Commit**

```bash
git add contracts/
git commit -m "feat(contracts): Path B metered operator top-up"
```

---

### Task 10: Owner sweep, then deploy to mainnet

**Files:**
- Modify: `contracts/src/SpendPolicyAccount.sol`
- Create: `contracts/test/Sweep.t.sol`
- Create: `contracts/script/Deploy.s.sol`
- Create: `docs/deployments.md`

**Interfaces:**
- Consumes: everything above
- Produces: a verified mainnet address recorded in `docs/deployments.md`, consumed by Tasks 13 and 14 and by Plans 2 and 3.

- [ ] **Step 1: Write the failing test**

`contracts/test/Sweep.t.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract SweepTest is Test {
    SpendPolicyAccount account;
    MockERC20 token;
    address owner = address(0xA11CE);
    address operator = address(0xB0B);

    function setUp() public {
        account = new SpendPolicyAccount(owner);
        token = new MockERC20();
        token.mint(address(account), 100e6);
    }

    function test_ownerCanSweepIgnoringPolicy() public {
        vm.prank(owner);
        account.sweep(address(token), owner, 100e6);
        assertEq(token.balanceOf(owner), 100e6);
    }

    function test_operatorCannotSweep() public {
        vm.prank(owner);
        account.setOperator(operator, true);
        vm.prank(operator);
        vm.expectRevert(SpendPolicyAccount.NotOwner.selector);
        account.sweep(address(token), operator, 1e6);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd contracts && forge test --match-contract SweepTest`
Expected: FAIL — `sweep` undefined.

- [ ] **Step 3: Implement sweep**

```solidity
    event Swept(address indexed token, address indexed to, uint256 amount);

    /// @notice Owner escape hatch. Deliberately bypasses policy: policy exists to
    ///         constrain the operator, never the owner.
    function sweep(address token, address to, uint256 amount) external onlyOwner {
        if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        emit Swept(token, to, amount);
    }
```

- [ ] **Step 4: Run the full suite**

Run: `cd contracts && forge test -vv`
Expected: all tests PASS.

- [ ] **Step 5: Write the deploy script**

`contracts/script/Deploy.s.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SpendPolicyAccount} from "../src/SpendPolicyAccount.sol";

contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER");
        address operator = vm.envAddress("OPERATOR");

        vm.startBroadcast();
        SpendPolicyAccount account = new SpendPolicyAccount(owner);
        account.setOperator(operator, true);
        vm.stopBroadcast();

        console.log("SpendPolicyAccount:", address(account));
    }
}
```

Note: `setOperator` is `onlyOwner`, so the broadcasting key must be the owner key.

- [ ] **Step 6: Deploy to Celo Sepolia first**

```bash
cd contracts
OWNER=<owner> OPERATOR=<operator> forge script script/Deploy.s.sol \
  --rpc-url celo_sepolia --broadcast --private-key $OWNER_PK
```
Expected: prints a deployed address.

- [ ] **Step 7: Deploy to Celo mainnet and verify**

```bash
cd contracts
OWNER=<owner> OPERATOR=<operator> forge script script/Deploy.s.sol \
  --rpc-url celo --broadcast --private-key $OWNER_PK \
  --verify --verifier-url https://api.celoscan.io/api --etherscan-api-key $CELOSCAN_KEY
```
Expected: deployed and source-verified. Open the address on Celoscan and confirm the source renders.

- [ ] **Step 8: Record the deployment**

`docs/deployments.md`:
```markdown
# Deployments

## Celo mainnet (42220)

- SpendPolicyAccount: <0x...>
- Owner: <0x...>
- Operator (= registered agentWalletAddress): <0x...>
- Deploy tx: <celoscan link>
- Verified: yes

## Celo Sepolia

- SpendPolicyAccount: <0x...>
```

- [ ] **Step 9: Commit**

```bash
git add contracts/ docs/deployments.md
git commit -m "feat(contracts): owner sweep; deploy and verify on Celo mainnet"
```

---

### Task 11: SDK — attribution wrapper

**Files:**
- Create: `sdk/package.json`, `sdk/tsconfig.json`, `sdk/vitest.config.ts`
- Create: `sdk/src/attribution.ts`, `sdk/src/index.ts`
- Create: `sdk/test/attribution.test.ts`

**Interfaces:**
- Consumes: the tag from Task 5, the call pattern proven in Task 3
- Produces: `withAttribution(data: \`0x${string}\` | undefined, tag: string): \`0x${string}\`` — appends an ERC-8021 suffix to calldata; used by Task 13.

- [ ] **Step 1: Create the SDK package**

`sdk/package.json`:
```json
{
  "name": "@leash/sdk",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@celo/attribution-tags": "0.3.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

`sdk/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src", "test"]
}
```

`sdk/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node' } })
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

`sdk/test/attribution.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fromDataSuffix } from '@celo/attribution-tags'
import { withAttribution } from '../src/attribution.js'

const TAG = 'celo_0123456789ab'

describe('withAttribution', () => {
  it('produces decodable calldata when there is no base calldata', () => {
    const data = withAttribution(undefined, TAG)
    expect(fromDataSuffix(data).codes).toContain(TAG)
  })

  it('preserves the original calldata prefix', () => {
    const base = '0xdeadbeef' as const
    const data = withAttribution(base, TAG)
    expect(data.startsWith(base)).toBe(true)
    expect(data.length).toBeGreaterThan(base.length)
  })

  it('appends rather than replaces when called on already-tagged data', () => {
    const once = withAttribution('0xdeadbeef', TAG)
    const twice = withAttribution(once, TAG)
    expect(twice.length).toBeGreaterThan(once.length)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm -F @leash/sdk test`
Expected: FAIL — cannot resolve `../src/attribution.js`.

- [ ] **Step 4: Implement it**

`sdk/src/attribution.ts`:
```ts
import { toDataSuffix } from '@celo/attribution-tags'

/**
 * Appends an ERC-8021 attribution suffix to calldata.
 *
 * Every outbound transaction must go through this. There is deliberately no
 * "send untagged" path: an untagged transaction scores zero on every track.
 */
export function withAttribution(
  data: `0x${string}` | undefined,
  tag: string,
): `0x${string}` {
  const suffix = toDataSuffix(tag)
  const base = data ?? '0x'
  return (base + suffix.slice(2)) as `0x${string}`
}
```

`sdk/src/index.ts`:
```ts
export { withAttribution } from './attribution.js'
export { FEE_CURRENCY_DIRECTORY, KNOWN_FEE_ADAPTERS } from './constants.js'
```

- [ ] **Step 5: Run the tests**

Run: `pnpm -F @leash/sdk test`
Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add sdk/
git commit -m "feat(sdk): attribution suffix wrapper"
```

---

### Task 12: SDK — fee currency selection

**Files:**
- Create: `sdk/src/feeCurrency.ts`
- Create: `sdk/test/feeCurrency.test.ts`
- Modify: `sdk/src/index.ts`

**Interfaces:**
- Consumes: `sdk/src/constants.ts` written by Task 2
- Produces: `pickFeeAdapter(balances: ReadonlyMap<\`0x${string}\`, bigint>, adapters?: readonly \`0x${string}\`[]): \`0x${string}\`` — throws `NoFundedFeeAdapterError` when nothing is funded.

- [ ] **Step 1: Write the failing test**

`sdk/test/feeCurrency.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { pickFeeAdapter, NoFundedFeeAdapterError } from '../src/feeCurrency.js'

const A = '0x0000000000000000000000000000000000000001' as const
const B = '0x0000000000000000000000000000000000000002' as const

describe('pickFeeAdapter', () => {
  it('picks the only funded adapter', () => {
    const balances = new Map([[A, 0n], [B, 1_000_000n]])
    expect(pickFeeAdapter(balances, [A, B])).toBe(B)
  })

  it('prefers the adapter with the largest balance', () => {
    const balances = new Map([[A, 5n], [B, 1_000_000n]])
    expect(pickFeeAdapter(balances, [A, B])).toBe(B)
  })

  it('throws when no adapter is funded', () => {
    const balances = new Map([[A, 0n], [B, 0n]])
    expect(() => pickFeeAdapter(balances, [A, B])).toThrow(NoFundedFeeAdapterError)
  })

  it('ignores balances for adapters not on the whitelist', () => {
    const rogue = '0x0000000000000000000000000000000000000009' as const
    const balances = new Map([[A, 1n], [rogue, 10_000_000n]])
    expect(pickFeeAdapter(balances, [A, B])).toBe(A)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -F @leash/sdk test feeCurrency`
Expected: FAIL — cannot resolve `../src/feeCurrency.js`.

- [ ] **Step 3: Implement it**

`sdk/src/feeCurrency.ts`:
```ts
import { KNOWN_FEE_ADAPTERS } from './constants.js'

export class NoFundedFeeAdapterError extends Error {
  constructor() {
    super(
      'No whitelisted fee-currency adapter has a balance. The operator wallet ' +
        'holds no CELO by design, so it cannot pay gas until one is funded.',
    )
    this.name = 'NoFundedFeeAdapterError'
  }
}

/**
 * Chooses which stablecoin pays for gas. Only adapters on the on-chain
 * whitelist are eligible — a balance in some other token is not spendable
 * as gas and is ignored.
 */
export function pickFeeAdapter(
  balances: ReadonlyMap<`0x${string}`, bigint>,
  adapters: readonly `0x${string}`[] = KNOWN_FEE_ADAPTERS,
): `0x${string}` {
  let best: `0x${string}` | undefined
  let bestBalance = 0n

  for (const adapter of adapters) {
    const balance = balances.get(adapter) ?? 0n
    if (balance > bestBalance) {
      best = adapter
      bestBalance = balance
    }
  }

  if (!best) throw new NoFundedFeeAdapterError()
  return best
}
```

Add to `sdk/src/index.ts`:
```ts
export { pickFeeAdapter, NoFundedFeeAdapterError } from './feeCurrency.js'
```

- [ ] **Step 4: Run the tests**

Run: `pnpm -F @leash/sdk test`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add sdk/
git commit -m "feat(sdk): fee-currency adapter selection"
```

---

### Task 13: SDK — policy client with pre-check

**Files:**
- Create: `sdk/src/abi.ts`, `sdk/src/policyClient.ts`
- Create: `sdk/test/policyClient.test.ts`
- Modify: `sdk/src/index.ts`

**Interfaces:**
- Consumes: `withAttribution` (Task 11), `pickFeeAdapter` (Task 12), the mainnet address (Task 10)
- Produces: `class LeashClient` with `remainingToday(token) -> Promise<bigint>`, `preCheck(token, to, amount) -> Promise<PreCheckResult>`, and `spend(token, to, amount, feeBalances: ReadonlyMap<\`0x${string}\`, bigint>) -> Promise<\`0x${string}\`>`. `PreCheckResult` is `{ ok: true } | { ok: false; error: string; spent: bigint; cap: bigint }`.

- [ ] **Step 1: Write the ABI module**

`sdk/src/abi.ts`:
```ts
export const spendPolicyAccountAbi = [
  {
    type: 'function', name: 'remainingToday', stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'limits', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [
      { name: 'perTx', type: 'uint256' },
      { name: 'daily', type: 'uint256' },
      { name: 'spentToday', type: 'uint256' },
      { name: 'day', type: 'uint64' },
    ],
  },
  {
    type: 'function', name: 'execute', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'topUpOperator', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const
```

- [ ] **Step 2: Write the failing test**

`sdk/test/policyClient.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { describePreCheckFailure } from '../src/policyClient.js'

describe('describePreCheckFailure', () => {
  it('turns a DailyCapExceeded revert into LLM-readable JSON', () => {
    const out = describePreCheckFailure({
      name: 'DailyCapExceeded',
      args: [18_400_000n, 5_000_000n, 20_000_000n],
    })
    expect(out).toEqual({
      ok: false,
      error: 'daily_cap_exceeded',
      spent: 18_400_000n,
      cap: 20_000_000n,
    })
  })

  it('turns a PerTxCapExceeded revert into LLM-readable JSON', () => {
    const out = describePreCheckFailure({
      name: 'PerTxCapExceeded',
      args: [11_000_000n, 10_000_000n],
    })
    expect(out).toEqual({
      ok: false,
      error: 'per_tx_cap_exceeded',
      spent: 0n,
      cap: 10_000_000n,
    })
  })

  it('turns PayeeNotAllowed into LLM-readable JSON', () => {
    const out = describePreCheckFailure({
      name: 'PayeeNotAllowed',
      args: ['0x00000000000000000000000000000000000000bd'],
    })
    expect(out).toEqual({
      ok: false,
      error: 'payee_not_allowed',
      spent: 0n,
      cap: 0n,
    })
  })

  it('falls back to a named unknown error rather than throwing', () => {
    const out = describePreCheckFailure({ name: 'SomethingElse', args: [] })
    expect(out.ok).toBe(false)
    expect(out.error).toBe('unknown_policy_error')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm -F @leash/sdk test policyClient`
Expected: FAIL — cannot resolve `../src/policyClient.js`.

- [ ] **Step 4: Implement it**

`sdk/src/policyClient.ts`:
```ts
import {
  createPublicClient, createWalletClient, http, encodeFunctionData,
  type Account, type PublicClient, type WalletClient,
} from 'viem'
import { celo } from 'viem/chains'
import { spendPolicyAccountAbi } from './abi.js'
import { withAttribution } from './attribution.js'
import { pickFeeAdapter } from './feeCurrency.js'

export type PreCheckResult =
  | { ok: true }
  | { ok: false; error: string; spent: bigint; cap: bigint }

/**
 * Maps a contract custom error onto a shape an LLM can act on.
 * Agents route around structured errors and stall on revert hex.
 */
export function describePreCheckFailure(
  revert: { name: string; args: readonly unknown[] },
): PreCheckResult {
  switch (revert.name) {
    case 'DailyCapExceeded':
      return {
        ok: false, error: 'daily_cap_exceeded',
        spent: revert.args[0] as bigint,
        cap: revert.args[2] as bigint,
      }
    case 'PerTxCapExceeded':
      return {
        ok: false, error: 'per_tx_cap_exceeded',
        spent: 0n,
        cap: revert.args[1] as bigint,
      }
    case 'PayeeNotAllowed':
      return { ok: false, error: 'payee_not_allowed', spent: 0n, cap: 0n }
    case 'TokenNotConfigured':
      return { ok: false, error: 'token_not_configured', spent: 0n, cap: 0n }
    case 'ContractPaused':
      return { ok: false, error: 'account_paused', spent: 0n, cap: 0n }
    case 'NotOperator':
      return { ok: false, error: 'not_an_operator', spent: 0n, cap: 0n }
    default:
      return { ok: false, error: 'unknown_policy_error', spent: 0n, cap: 0n }
  }
}

export class LeashClient {
  readonly #pub: PublicClient
  readonly #wallet: WalletClient
  readonly #account: Account
  readonly #address: `0x${string}`
  readonly #tag: string

  constructor(opts: {
    account: Account
    accountAddress: `0x${string}`
    attributionTag: string
    rpcUrl?: string
  }) {
    this.#account = opts.account
    this.#address = opts.accountAddress
    this.#tag = opts.attributionTag
    this.#pub = createPublicClient({
      chain: celo, transport: http(opts.rpcUrl),
    })
    this.#wallet = createWalletClient({
      account: opts.account, chain: celo, transport: http(opts.rpcUrl),
    })
  }

  async remainingToday(token: `0x${string}`): Promise<bigint> {
    return this.#pub.readContract({
      address: this.#address,
      abi: spendPolicyAccountAbi,
      functionName: 'remainingToday',
      args: [token],
    })
  }

  /** Simulates the spend so a rejected call costs no gas. */
  async preCheck(
    token: `0x${string}`, to: `0x${string}`, amount: bigint,
  ): Promise<PreCheckResult> {
    try {
      await this.#pub.simulateContract({
        address: this.#address,
        abi: spendPolicyAccountAbi,
        functionName: 'execute',
        args: [token, to, amount],
        account: this.#account,
      })
      return { ok: true }
    } catch (err) {
      const data = (err as { cause?: { data?: { errorName?: string; args?: readonly unknown[] } } })
        .cause?.data
      return describePreCheckFailure({
        name: data?.errorName ?? 'unknown',
        args: data?.args ?? [],
      })
    }
  }

  /** Sends a policy-checked spend, tagged and paying gas in a stablecoin. */
  async spend(
    token: `0x${string}`, to: `0x${string}`, amount: bigint,
    feeBalances: ReadonlyMap<`0x${string}`, bigint>,
  ): Promise<`0x${string}`> {
    const calldata = encodeFunctionData({
      abi: spendPolicyAccountAbi,
      functionName: 'execute',
      args: [token, to, amount],
    })

    return this.#wallet.sendTransaction({
      account: this.#account,
      chain: celo,
      to: this.#address,
      data: withAttribution(calldata, this.#tag),
      feeCurrency: pickFeeAdapter(feeBalances),
    })
  }
}
```

Add to `sdk/src/index.ts`:
```ts
export { LeashClient, describePreCheckFailure } from './policyClient.js'
export type { PreCheckResult } from './policyClient.js'
export { spendPolicyAccountAbi } from './abi.js'
```

- [ ] **Step 5: Run the tests**

Run: `pnpm -F @leash/sdk test`
Expected: all 11 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add sdk/
git commit -m "feat(sdk): policy client with LLM-readable pre-check errors"
```

---

### Task 14: The gate test — a real tagged mainnet spend

This is the boundary between scoring and scoring zero. It must be an automated test, not a one-time manual check.

**Files:**
- Create: `sdk/test/mainnet.gate.test.ts`
- Modify: `sdk/package.json`
- Modify: `docs/deployments.md`

**Interfaces:**
- Consumes: `LeashClient` (Task 13), the mainnet address (Task 10), the tag (Task 5)
- Produces: a green gate test plus a proof transaction link recorded in `docs/deployments.md`.

- [ ] **Step 1: Write the gate test**

`sdk/test/mainnet.gate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyTx } from '@celo/attribution-tags'
import { LeashClient } from '../src/index.js'

const {
  LEASH_ACCOUNT, ATTRIBUTION_TAG, OPERATOR_PK,
  SPEND_TOKEN, SPEND_PAYEE, FEE_ADAPTER,
} = process.env

const ready = Boolean(
  LEASH_ACCOUNT && ATTRIBUTION_TAG && OPERATOR_PK &&
  SPEND_TOKEN && SPEND_PAYEE && FEE_ADAPTER,
)

describe.runIf(ready)('mainnet attribution gate', () => {
  it('sends a real spend whose tag verifyTx can read back', async () => {
    const account = privateKeyToAccount(OPERATOR_PK as `0x${string}`)
    const pub = createPublicClient({ chain: celo, transport: http() })

    const leash = new LeashClient({
      account,
      accountAddress: LEASH_ACCOUNT as `0x${string}`,
      attributionTag: ATTRIBUTION_TAG!,
    })

    const token = SPEND_TOKEN as `0x${string}`
    const check = await leash.preCheck(token, SPEND_PAYEE as `0x${string}`, 1n)
    expect(check.ok).toBe(true)

    const feeBalances = new Map([[FEE_ADAPTER as `0x${string}`, 1_000_000n]])
    const hash = await leash.spend(
      token, SPEND_PAYEE as `0x${string}`, 1n, feeBalances,
    )

    const receipt = await pub.waitForTransactionReceipt({ hash })
    expect(receipt.status).toBe('success')

    const attribution = await verifyTx({ client: pub, hash })
    expect(attribution?.codes).toContain(ATTRIBUTION_TAG)

    console.log('proof tx:', `https://celoscan.io/tx/${hash}`)
  }, 120_000)
})
```

`describe.runIf` keeps the suite green in CI where the env vars are absent, without ever silently passing when they are present.

- [ ] **Step 2: Add the script**

In `sdk/package.json`, extend `scripts`:
```json
  "scripts": {
    "test": "vitest run --exclude '**/*.gate.test.ts'",
    "test:gate": "vitest run mainnet.gate"
  }
```

- [ ] **Step 3: Verify it skips without credentials**

Run: `pnpm -F @leash/sdk test`
Expected: the unit tests PASS and the gate test is not collected.

- [ ] **Step 4: Run it for real against mainnet**

```bash
LEASH_ACCOUNT=<contract> ATTRIBUTION_TAG=<celo_...> OPERATOR_PK=<key> \
SPEND_TOKEN=<stablecoin> SPEND_PAYEE=<address> FEE_ADAPTER=<adapter> \
  pnpm -F @leash/sdk test:gate
```
Expected: PASS, and it prints a Celoscan link.

Open the link and confirm two things by eye: the transaction succeeded, and the operator's CELO balance is zero.

- [ ] **Step 5: Record the proof**

Append to `docs/deployments.md`:
```markdown
## Attribution proof

- First tagged mainnet spend: <celoscan link>
- verifyTx codes: [<celo_...>]
- Operator CELO balance at time of send: 0
```

- [ ] **Step 6: Commit**

```bash
git add sdk/ docs/deployments.md
git commit -m "test(sdk): mainnet attribution gate test"
```

---

## Definition of Done for This Plan

- [ ] All three W0 spikes recorded in `spikes/README.md` with PASS/FAIL and evidence
- [ ] Registered with celobuilders; `attributionTag` recorded in `docs/registration.md`
- [ ] `agentWalletAddress` registered is the operator EOA, verified against `docs/deployments.md`
- [ ] Repo public on GitHub and resolving while logged out
- [ ] `cd contracts && forge test` — all green, including the fuzz test
- [ ] `pnpm -F @leash/sdk test` — all green
- [ ] `SpendPolicyAccount` deployed and source-verified on Celo mainnet
- [ ] `pnpm -F @leash/sdk test:gate` — green, with a Celoscan link proving the tag round-trips
- [ ] Operator EOA holds zero CELO and has still transacted successfully

## What This Plan Does Not Cover

- W3 (x402 buyer) and W4 (MCP server) — Plan 2, written after Task 4 resolves the signing path
- W5 (frontend, Van Gogh design system) — Plan 3
- W6 (AskBots rounds, demo video, submission) — a checklist, not a code plan
- `executeWithOwnerSig`, `leash_request_approval`, Approval Inbox — descoped in the spec
- Arbitrary contract calls through Path A — reduced to transfers only; see the scope note in Task 8
