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
