# Deployments

## Celo mainnet (42220) — current

- SpendPolicyAccount: `0x7aDa926B021BAef4896F51F237bCA61435E43fd2`
- Owner: `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57`
- Operator (= registered `agentWalletAddress`): `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`
- Explorer: https://celoscan.io/address/0x7ada926b021baef4896f51f237bca61435e43fd2
- Verified: yes — `SpendPolicyAccount`, solc `v0.8.24+commit.e11b9ed9`, optimizer on, 200 runs
- Deploy tx: 0x8a6f4d8cfd9d49d22f3948af384f87ba169533d903e12885aa3296bc0a2fc779
- `setOperator` tx: 0x3123dafc5aebba73a7ba36f6db168ed9b771e630060d1db2afe8769f1b6390de
- Deployed: 2026-09-03
- Cost, deploy through migration: 0.194338 CELO (about $0.015)

Deployed because removing `receive()` changes the bytecode. The previous
instance accepted native CELO it could never return — `sweep()` moves ERC-20
only and nothing in the contract can `call{value:}` — so anything sent that way
was lost. The contract is not upgradeable, so fixing it means a new address.

Checked against the chain rather than taken from the deploy output:

| call | value |
|---|---|
| `owner()` | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` |
| `operators(operator)` | `true` |
| `operators(owner)` | `false` |
| `paused()` | `false` |
| `allowlistEnabled()` | `false` |
| `remainingToday(USDC)` | `1000000` |
| USDC balance | `2496567` |
| code size | 3406 bytes, against the old instance's 3584 |

### Migration from the superseded instance, 2026-09-03

| step | tx |
|---|---|
| Sweep 2.496567 USDC out of the old account, tx: 0xaf2153d75d752c1ef9a04166d31d033335091478a89fe9a103ff475b3d2708aa |
| `setPolicy` 0.50 per tx / 1.00 per day, tx: 0x51126444e08f6bdecd61e7fb826e012810e2cbf46459c09e72a75f448b859714 |

The old account holds 0 USDC after the sweep, read back off the chain.

**The ERC-8004 registration is unaffected.** Only the account contract moved.
The operator EOA — what is registered as `agentWalletAddress`, and what x402
attribution keys off — did not change, so agentId 9804 stays valid.

## Celo mainnet (42220) — SUPERSEDED 2026-09-03

**Do not use. Accepted native CELO that could never be recovered.** Kept because
every proof transaction below happened against it and is still true history.

- SpendPolicyAccount: `0x895B773Ef88cA27699Df58F9F45962F847bbE9CE`
- Owner: `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57`
- Operator (= registered `agentWalletAddress`): `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`
- Deploy tx: 0xa2f504062b2067321182bdec1bd3cfb49a8ee81e0c78c7a81b52093c38fe3c91
- Explorer: https://celoscan.io/address/0x895b773ef88ca27699df58f9f45962f847bbe9ce
- Verified: yes — `SpendPolicyAccount`, solc `v0.8.24+commit.e11b9ed9`, optimizer on, 200 runs
- Deployed: 2026-09-02
- Cost: 0.175 CELO (about $0.013)

Checked against the chain rather than taken from the deploy output:

| call | value |
|---|---|
| `owner()` | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` |
| `operators(operator)` | `true` |
| `operators(owner)` | `false` |
| `paused()` | `false` |
| `allowlistEnabled()` | `false` |

The owner is deliberately **not** an operator. It can set policy, pause, and
sweep; it cannot spend through the agent's paths. Constructor arguments decode
to the owner address, and `module=contract&action=getsourcecode` on the
Etherscan V2 endpoint returns 6025 characters of source.

### Policy state

No token policy is configured yet. Every operator path reverts
`TokenNotConfigured` until the owner calls `setPolicy`. The payee allowlist is
off, so `execute()` currently accepts any payee once a policy exists.

## Celo Sepolia

Not deployed. The plan called for a testnet rehearsal, but the owner EOA holds
no Sepolia funds and the faucet is a manual step. A fork simulation against
live mainnet state exercised the same script for nothing, and predicted this
exact address.

## Attribution proof

- First tagged mainnet spend, tx: 0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70
  (https://celoscan.io/tx/0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70)
- verifyTx codes: `["celo_3dec652cd977"]`
- Operator CELO balance at time of send: **0**

Reproduce with `pnpm -F @leash/sdk test:gate`.

Read back off the chain rather than taken from the test's own output:

| checked | value |
|---|---|
| calldata selector | `0xeafaddfd` = `execute(address,address,uint256)` |
| calldata tail | the tag, then the ERC-8021 marker |
| envelope type | `0x7b` (CIP-64) with `feeCurrency` = USDC adapter |
| operator CELO | `0` |
| contract USDC | 1500000 → 1499999 |
| payee USDC | received exactly 1 |
| `remainingToday` | 1000000 → 999999 |

The daily counter moved by exactly the amount spent, which is what makes this a
policy-enforced spend rather than a transfer that merely happened to succeed.

### Policy state (set 2026-09-02)

| token | perTx | daily |
|---|---|---|
| USDC `0xceb…118C` | 0.50 | 1.00 |

Per-tx is deliberately below the daily cap so a demo runs into the DAILY limit:
two spends of 0.40 fit and a third does not, which reverts `DailyCapExceeded`
("the agent has spent its day") rather than `PerTxCapExceeded` ("that one
transaction was too big"). Contract holds 1.50 USDC; the operator keeps 1.05 to
pay gas with, at roughly $0.0022 a transaction.

The payee for the proof spend is the owner EOA — the transfer is 1 unit
($0.000001) and exists to prove the tag round-trips through a real policy
check, not to move value. It is a wallet this project controls and must be
declared under `otherWallets` at submission.

## x402 proof — payment drawn through the policy

- Resource: `https://usebuy.ai/gcloud/vm`, `e2-micro` (1h VM that runs a script)
- Top-up, tx: 0xec08a20020983992d18d6faa7cccd91e0bba0f2432e6f22e534616b96f2f33db
  — contract → operator, under the daily cap
  (https://celoscan.io/tx/0xec08a20020983992d18d6faa7cccd91e0bba0f2432e6f22e534616b96f2f33db)
- Settlement, tx: 0xb5dd4d16a7e65453ddcdc70b235384a7bc20c8845a8ce5096084c7f7f2a91e25
  — operator → gateway, facilitator-submitted
  (https://celoscan.io/tx/0xb5dd4d16a7e65453ddcdc70b235384a7bc20c8845a8ce5096084c7f7f2a91e25)
- Operator CELO balance throughout: **0**
- Drawn from the account: **19226** atomic USDC — the policy's per-tx and daily
  caps applied to this draw, which is the only route x402 money takes out of
  the contract.

### It took two runs, and that is the honest record

The first gate run drew through the policy and then hit a `500` from the
gateway. x402 has no refund primitive, so `payAndFetch` refused to retry and
raised `may_have_settled: true`. The chain, not the test output, settled the
question:

| read | value | means |
|---|---|---|
| contract USDC | 2515793 → 2496567 | the draw happened, −19226 |
| `remainingToday` | 999999 → 980773 | −19226, **the daily cap consumed exactly the draw** |
| operator USDC | 12527 → 28968 | +16441 = 19226 drawn − 2785 gas |
| operator USDC vs price | 28968 > 16753 | **the settlement had not run; the money was still ours** |

Having *proved* nothing settled, the retry was no longer a gamble, and the
second run paid. So the two legs are proved by two runs rather than one: the
first is the only evidence that the daily cap governs an x402 draw, and the
second is the evidence that the payment itself completes.

Read back off the chain rather than taken from the test's own output:

| checked | value |
|---|---|
| settlement receipt | `status 1 (success)` |
| submitted by | `0xF8d2CC13…6CE3e` — the facilitator, not us |
| envelope | type `0x2`, `feeCurrency` unset — the facilitator paid this gas |
| operator USDC | 28968 → 12215, exactly −16753 |
| gateway USDC | 385317 → 402070, exactly +16753 |
| operator CELO | `0` before and after |

### Two mainnet findings that came out of this gate

1. **A `feeCurrency` transaction with no gas limit reserves the block gas
   limit.** The node demands `blockGasLimit * gasPrice` against the operator's
   stablecoin before it will simulate — measured at **0.465169 USDC** against
   ~0.0022 actually spent, a 209x demand. Bisection put the operator's largest
   sendable transfer at 565625 of its 1030794 balance, and `reserve / gasPrice`
   came to 30,055,356 against a block gas limit of 30,000,000. This made Path B
   unreachable: `topUpOperator` exists for an operator short of the *price*, and
   such an operator is far shorter of the *reserve*. `LeashClient` now sends an
   explicit `GAS_LIMIT`. **This corrects the "roughly 3x what the transaction
   costs" note in `docs/RESUME.md`.**

2. **A draw sized to the bare shortfall cannot pay.** The draw pays its own gas
   in the same stablecoin it is drawing, so drawing exactly `price - held` lands
   the operator on `price` and gas then takes it below the amount it already
   signed for. `payForResource` draws a buffer on top, sized to cover that gas
   *and* leave a float — an operator below the reserve cannot send even the draw
   that would refill it, and strands until the owner rescues it.
