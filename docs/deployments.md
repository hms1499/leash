# Deployments

## Celo mainnet (42220)

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
