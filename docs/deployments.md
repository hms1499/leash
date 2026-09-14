# Deployments

## Celo mainnet (42220) — current, v2

- SpendPolicyAccount: `0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d`
- Owner: `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57`
- Operator (= registered `agentWalletAddress`): `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`
- Explorer: https://celoscan.io/address/0xbe380aa73c036da30d3b2fd5e75b0d1d89e11c3d
- Verified: yes — `SpendPolicyAccount`, solc `0.8.24`, verified 2026-09-12 and
  confirmed with `forge verify-check` returning `Pass - Verified`, not inferred
  from the submission's `OK`
- Deploy tx: 0xad28ee0dc8a25bc9e1896fed8bde1d3dd88804f3f4f93a5eb96c4f32422e7449
- Block: 77319026
- Constructor argument: `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` (the owner)
- Deployed: 2026-09-12, through the wizard at `/setup` rather than through a
  script — `app/lib/contract.ts` is where a stale-bytecode bug hides, and a
  `forge` deploy would not have touched it

v2 makes the owner movable and puts `topUpOperator` behind an owner switch that
is off at construction. The contract is not upgradeable, so this is a new
address and `0x7aDa926B…E43fd2` is superseded.

**The first attempt deployed v1.** The wizard was started from the main
checkout, whose `app/lib/contract.ts` still carries v1 bytecode — every v2 change
lives on an unpushed branch in a worktree. It produced
`0x7156af4f9552a77736ad77772b46fd4d3c3c5e07`, which answers `owner()` and
reverts on `pendingOwner()`. Caught by Step 3's three `cast call`s, which exist
for exactly this. The 1.000000 USDC it held was swept back to the owner,
tx: 0x6aef2c65af8cfa4df25d6ea281ffdd3fd8004ed43ecc16b80844231e13f6d0ff, and the
account reads 0 afterwards. Cost: CELO gas only, no USDC lost.

Checked against the chain rather than taken from the deploy output:

| call | value |
|---|---|
| `owner()` | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` |
| `pendingOwner()` | `0x0000000000000000000000000000000000000000` — **v1 reverts here; this is the v2 proof** |
| `topUpEnabled()` | `false` — off at construction, as designed |
| `operators(operator)` | `true` |
| `paused()` | `false` |
| `allowlistEnabled()` | `false` — matching v1, so the proofs stay comparable |
| `limits(USDC)` | perTx `500000`, daily `1000000`, spentToday `0` |
| `remainingToday(USDC)` | `1000000` |
| USDC balance | `1000000` |
| operator USDC balance | `87776` |
| code size | 3766 bytes, against v1's 3406 |

Not yet done at this point: gas constants are still the plan's guesses (Task
11), and nothing has been re-proved on mainnet (Task 12). `topUpEnabled` stays
`false` until Task 12 proves the refusal it causes, then flips it to prove x402.

### What v2 was proved to do, 2026-09-12

Every figure below was read off the chain at the transaction's own block, not
after its receipt. forno is load-balanced and serves stale reads after a
confirmed transaction, so a receipt proves a transaction landed and never that
the next node asked has seen that block.

**The policy gates a spend, and the refusal costs nothing.**
A `preCheck` of 0.90 against the 0.50 per-transaction cap returned
`per_tx_cap_exceeded` as a staticcall — no transaction, no gas. Then a real
0.01 spend, tx: 0x11cc0100809084880c68b401668dfa46b3eaf32d61bea43fa40ee897dc8246fc
at block 77320153. Read at 77320152 against 77320153: `remainingToday`
1000000 → 990000, the account 1000000 → 990000, the payee 150000 → 160000.
All three moved by exactly 10000.

**Zero-CELO gas, and attribution.** The operator held `0` native CELO for every
transaction on this page — asserted, not assumed. `verifyTx({client, hash})`
on the spend above returned `["celo_3dec652cd977"]`, matching `ATTRIBUTION_TAG`.

**An agent spent through the policy.** An MCP agent in a separate session,
given the account through `LEASH_ACCOUNT` and no amount or payee by any human,
called `leash_pay`:
tx: 0x3cb307a4fde990a3f9282348999127daf022f4caea264af16426595158148704
at block 77322601. Read at 77322600 against 77322601: `remainingToday`
932670 → 832670, the account 935509 → 835509, the payee 885417 → 985417 — all
three by exactly 100000.

**`topUpOperator` refused while the switch was off.** Free: a staticcall sends
nothing. The JSON an agent receives names the owner and `setTopUpEnabled` and
does not mention midnight, because waiting never clears a switch a human threw.
Getting this proof is what found the `leash_fetch` defect fixed at 21a4f96 —
it was attaching `daily_cap: 0.000000` to a refusal that carries no figures.

**The switch, turned on from the dashboard.**
`TopUpEnabledSet(true)`,
tx: 0x4fb014ee38f97a8b343ed9f7b71eb6e99e3d7dacd44c46ee654041630629a201
at block 77321507.

**x402 Path B, with a real draw through the policy.**
draw tx: 0xd03c3b264129ba303bc394f8cfbaedad545ca4813b6e0fc6c1a12447d2baa807
at block 77321850,
settlement tx: 0xedd104e390d32c0d96b0b1c5e07365e2688344ee4905c3d7f3092d21815865ef.
Paid 16753, drew 17330, HTTP 200, settlement `success`. Read at 77321849
against 77321850: `remainingToday` 990000 → 972670 and the account
1037839 → 1020509, both exactly the size of the draw. The draw is bounded by
the same daily cap as any spend, which is the guarantee being made.

The operator had to be drained below the price first. An earlier run bought the
same resource outright with money it already held — `drawn_from_account`
0.000000, settlement
tx: 0x9e0d4b7fe36506bc776b336336ee574352979908512199cda6179c853a0e6ef7 — which
is documented behaviour and proves nothing about the switch. It is recorded
here so it is not mistaken later for the proof above.

**The demo, end to end.** Three spends and a refusal:
tx: 0x8e67d5232faed5cf2153b90186a8fc26a00f581f258f7550ce9252e12f1c3a68,
tx: 0x2b3508ddfa4ca8fe0e8b8133fab42960a03a4c31a8572b0c839682acd87f02d8,
tx: 0x6690783517b7a924d9d89e92e30b0def7b1dd91367881247a904d084ff9c5d1c.
`remaining_today` fell 0.96267 → 0.95267 → 0.94267 → 0.93267, then
`per_tx_cap_exceeded` on 0.90 as a staticcall costing nothing.

An earlier run of the same demo lost two of its three spends and is **not** a
proof. Its first spend is real
(tx: 0x3978ce635b1bf82c6df6cbe11d8da0c2d2920a92338080a13d4d14a3bdc778a5) but a
run that failed twice is not what the demo claims to be. What it failed on is
the defect fixed at 10e1fc8.

**The live feed.** Observed by the maintainer with the dashboard open and no
reload. There is no machine artefact for this one and none is claimed: a feed
that updates without a reload can only be watched.

**The account changed hands, and came back.** Six events, of which only two
moved anything:

| block | event | tx |
|---|---|---|
| 77322794 | `OwnershipTransferStarted` 0x2B33 → 0x64Ad | tx: 0x2c5044f073c8f6f3cf117ed3967c8e3238a3b1dc5a08a8fffaa7e47d4d2405a5 |
| 77322898 | **`OwnershipTransferred`** 0x2B33 → 0x64Ad | tx: 0xc703cbcd32d37cee69a3fd618cca0f7fc4da4ac11a3150c7fbce210456499e47 |
| 77323063 | `OwnershipTransferStarted` 0x64Ad → 0x64Ad | tx: 0x315f80f4098c8a30d30d7f937bcf7a7d12d48e39b58f661af0de763f5801ed8b |
| 77323222 | `OwnershipTransferStarted` 0x64Ad → 0x2B33 | tx: 0x25707cc95218d10ab49849eda2fcbc59e96b0169efd549e50bf58b5b66829963 |
| 77323234 | `OwnershipTransferStarted` 0x64Ad → 0x2B33 | tx: 0xefbc7a85fa1a925a9019e3124617ee187e7a3534f6f8ac30e5cc6a05737dcc57 |
| 77323403 | **`OwnershipTransferred`** 0x64Ad → 0x2B33 | tx: 0xe025d7e66bf00c475c716934ab21e4d99714783466c3a8ef20a043a08dfb157e |

The nomination at 77323063 is a wallet nominating itself, and it is left in the
record rather than tidied away. It is the case the 2026-09-12 invariant work
decided **not** to guard against — a self-nomination confers nothing, because
the wallet already holds every power acceptance would grant, and forbidding a
no-op would have cost a line of a contract that cannot be upgraded. It then
happened on mainnet within the hour and was harmless, as predicted.

While ownership sat with 0x64Ad, the original owner was refused: a simulated
`transferOwnership` from 0x2B33 reverted `NotOwner` (`0x30cd7471`), and from an
address holding only the dashboard link it reverted the same way. The display
gate in the app hides the control, but the contract is the boundary.

**Two outcomes were NOT observed and are not claimed.** `spend_reverted` and
`sent_unconfirmed` need a chain that misbehaves on cue. Both are covered by
unit tests only. Do not read this page as saying otherwise.

Three defects were found by earning these proofs rather than by any test, and
each is fixed with a regression test: `leash_fetch` inventing cap figures
(21a4f96), `MIN_OPERATOR_FLOAT` too small to stop the bricking it exists to
prevent (10e1fc8), and a success message outliving the wallet that earned it
(6d4a68b).

State at the end of the session:

| | |
|---|---|
| `owner()` | `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57` — handed back |
| `pendingOwner()` | `0x0000000000000000000000000000000000000000` |
| `topUpEnabled()` | `true` — left on, having been proved in both states |
| `remainingToday(USDC)` | `832670` |
| account USDC | `835509` |
| operator USDC | `41781`, native CELO `0` |

---

## Celo mainnet (42220) — v1, superseded 2026-09-12

- SpendPolicyAccount: `0x7aDa926B021BAef4896F51F237bCA61435E43fd2`
- Owner: `0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57`
- Operator (= registered `agentWalletAddress`): `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`
- Explorer: https://celoscan.io/address/0x7ada926b021baef4896f51f237bca61435e43fd2
- Verified: yes — `SpendPolicyAccount`, solc `v0.8.24+commit.e11b9ed9`, optimizer on, 200 runs
- Deploy tx: 0x8a6f4d8cfd9d49d22f3948af384f87ba169533d903e12885aa3296bc0a2fc779
- `setOperator` tx: 0x3123dafc5aebba73a7ba36f6db168ed9b771e630060d1db2afe8769f1b6390de
- Deployed: 2026-09-03
- Cost, deploy through migration: 0.194338 CELO (about $0.015)

**Superseded by v2 `0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d`**, which makes
the owner movable and puts `topUpOperator` behind a switch that is off at
construction. The contract is not upgradeable, so neither change could reach
this address. Nothing here is wrong — v1 still enforces every cap it ever did,
and the transaction hashes on this page stay because they are true statements
about v1. It is simply no longer what the repo points at.

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

## Accounts owned by somebody else, on mainnet

Two `SpendPolicyAccount` instances exist that this project did not deploy and
does not own. Both were deployed **directly from the owner's own EOA** through
the hosted wizard, which is what `app/lib/accountDiscovery.ts` relies on: it
finds an account by matching a contract-creation transaction whose `from` is
the owner. Neither is project infrastructure and neither is the demo account.

They are recorded here because they were missing from this file, and because a
contract this project has any hand in must be declarable in the submission's
`ownContracts`. Read off the chain 2026-09-08, not taken from any earlier note:

| | `0xA73DB76f20c5ede3ABE883565D22905760F83982` | `0x7757035dd318eF1FC878bD83B06EE46eF3Ae0d9c` |
|---|---|---|
| Purpose | test account, used to exercise the UI | the wizard walk of 2026-09-07 |
| Deployed | 2026-09-04T07:34:07Z, block 76606489 | 2026-09-07 |
| Deployed by | `0x94f7268ca8b29d536f8c5cd0753753d55Fb06459` (= its own owner) | same |
| `owner()` | `0x94f7268c…6459` | `0x94f7268c…6459` |
| `operators(0xd44daF…50D6)` | true | true |
| Per-tx / daily (USDC) | 0.50 / 1.00 | 0.50 / 5.00 |
| `paused()` | **true** | **true** |
| `allowlistEnabled()` | false | false |
| USDC balance | **0** | **0** |
| Code size | 3406 bytes | 3406 bytes |
| Source-verified | yes | **no** |

Creation transactions:

- `0xA73DB76f…F83982`, tx: 0xf8d390ede87c5126b8f43e5b4f20d3894b9c18dafb08b7eba59e0f9fae5ad324
- `0x7757035d…0d9c`, tx: 0x48fabcd68ce64dc6921a753a3ceee6065fdf5ea214ddf28162f57cb2cec8fdd3

Three things this re-read contradicts, which is why it is dated rather than
written into the tables above it:

- `docs/RESUME.md` says `0xA73DB76f…` reads ACTIVE and holds 0.040000 USDC, read
  2026-09-05. It is paused and holds nothing on 2026-09-08.
- The 2026-09-07 wizard-walk table below records `0x7757035d…` as `Paused false`
  with a 1.00 USDC balance. That was true when it was written and is not true
  now. **The table is not edited**: it is the record of what the walk saw.
- `0x7757035d…` is **not source-verified on Blockscout**, unlike every account
  this project deployed itself. The wizard deploys bytecode; it does not verify.

**Both share the operator EOA `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`** with
the project's own account. That is the same reuse `docs/deployments.md` already
flags as a limit on the stranger-walk measurement — a stranger would have had to
generate an operator, and did not.

**Submission gap, CLOSED 2026-09-14.** `ownContracts` declared `0x7aDa926B…`,
`0xA73DB76f…` and `0x895B773E…`, and declared neither `0x7757035d…` nor the v2
account `0xBE380aa7…` that superseded `0x7aDa926B…` and is what every live
surface now points at. The skill warns that undeclared wallets which look
project-controlled are read as farming signals at audit. It now declares all
six — v2, v1, `0x895B773E…`, `0x7156af4f…`, `0xA73DB76f…`, `0x7757035d…` —
read back from `GET /submissions/me`, not inferred from the PUT. The same
update moved `contractAddresses` off v1 and onto v2; see `docs/registration.md`.

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

## npm — `leash-agentpay@0.3.1`, published 2026-09-10

| | |
|---|---|
| Package | `leash-agentpay@0.3.1`, public, tag `latest` |
| Contents | 4 files |
| Unpacked | 52,986 bytes |
| shasum | `b3393c9b9f5263d0a18645d7128140f18b439f87` |
| Publisher | npm account `vanhuy1999` |

**This is what `npx -y leash-agentpay` serves today**, and what every reader of
`docs/quickstart.md` runs. The sections below it document 0.2.1 and 0.1.0 and
are kept as the record of those releases, not as the current version.

A patch over 0.3.0, cut 36 minutes later, for a reason worth stating plainly:
`leash_fetch`'s description ships *inside* the published bin. 65c36a3 corrected
that description — it had been promising a guarantee the policy cannot make —
but a correction in the repository reaches nobody running `npx`. Until a
version carried it, 0.3.0 kept telling every agent that the caps always apply.

Verified before cutting: `test:bundle` 3/3 against the packed tarball, mcp
29/29 at that commit (35/35 today).

## npm — `leash-agentpay@0.3.0`, published 2026-09-10

| | |
|---|---|
| Package | `leash-agentpay@0.3.0`, public |
| Contents | 4 files |
| Unpacked | 51,250 bytes |
| shasum | `922d66d632d8a79d029335214e93a9012b13abd4` |
| Publisher | npm account `vanhuy1999` |

0.2.1 read the x402 challenge out of the 402 body, so every **v2** endpoint came
back `malformed_challenge`. The transport fix landed in f19abab; this is the
version that carried it to anyone running `npx leash-agentpay`.

Proved end to end before publishing, not after: bought
`agent402.tools/api/tls-cert` for 0.001 USDC through the build, settled on
chain at block 77145888, status `0x1` — an `AuthorizationUsed` plus a
1000-atomic `Transfer` to the `payTo` the v2 challenge named. First time
`PAYMENT-SIGNATURE` was accepted by a real v2 facilitator.

sdk 75/75, mcp 29/29, `test:bundle` 3/3 at that commit.

## npm — `leash-agentpay@0.2.1`, published 2026-09-07

| | |
|---|---|
| Package | `leash-agentpay@0.2.1`, public, tag `latest` |
| Contents | 4 files — `dist/index.js` (41.8 kB), `package.json`, `README.md`, `LICENSE` |
| Packed size | 15.5 kB (49.3 kB unpacked) |
| shasum | `3aa324e5687ea3800176d729c01e557d5197fd64` |
| Publisher | npm account `vanhuy1999` |

A patch, published within the hour of 0.2.0, because walking 0.2.0 found a
defect that no suite had: a failed `quote` escaped `leash_fetch` and was
reported as `internal_error - Check the server logs and the LEASH_*
environment variables`, about a configuration that was correct. Only the buying
branch had been inside a try/catch.

### Walked from the registry, 2026-09-07

`mcp/scripts/verify-published.mjs` — cold npm cache, empty directory, install
from the registry, bin started **by name**:

```
[5.9s] npm install leash-agentpay@0.2.1 from the registry finished
[5.9s] bin linked as a command: true
[5.9s] installed version: 0.2.1
[5.9s] @leash/sdk on disk: false
[6.9s] server connected over stdio
[6.9s] tools: leash_status, leash_pay, leash_fetch
[7.4s] leash_status: remaining_today 1.000000, per_tx 0.500000, daily 1.000000
[8.2s] leash_fetch quote_only            -> price 0.016753, within_max true
[8.4s] leash_fetch quote_only, NO body   -> not_paywalled, status 400
```

The last line is the one this release exists for, and it is checked rather than
read: the script fails the walk if that call comes back `internal_error`.

`shasum` of the tarball fetched back from npm is
`3aa324e5687ea3800176d729c01e557d5197fd64`, the figure npm printed at publish
time — so the bytes being served are the bytes that were built.

### `leash_pay` proven on mainnet, 2026-09-07

`mcp/scripts/prove-pay.mjs`, run against 0.2.1 installed from the registry: a
real 0.01 USDC payment, then every figure checked at that transaction's own
block rather than at head.

```
BEFORE  remaining 1000000  account 200000  payee 0
leash_pay returned after 7.4s (it waited for the chain)
receipt.status = success   block 76852175
AFTER   remaining  990000  account 190000  payee 10000

PASS  the tool reported ok
PASS  the receipt says the transaction succeeded
PASS  the allowance fell by exactly 10000
PASS  the account fell by exactly 10000
PASS  the payee rose by exactly 10000
```

tx: 0x0786b9796e73feee95e3ce5e19a1ad0b63559512bbbace3ee3e165be11628b21

**The 7.4s is the point.** Before this release `leash_pay` returned the instant
a node accepted the transaction — it could not have taken that long, because it
waited for nothing. The elapsed time is the fix, visible from outside.

Reads are pinned to `receipt.blockNumber`. A read at head would race the load
balancer and prove nothing in either direction; that is exactly what made the
demo print a counter which had not moved on 2026-09-05.

**Still unproven:** `spend_reverted` and `sent_unconfirmed`. Both need a chain
that misbehaves on cue — a transaction that reverts after a clean simulation,
or one that stays unmined past the window. Unit tests cover both branches. The
chain has not, and this document does not claim it has.

## npm — `leash-agentpay@0.2.0`, published 2026-09-07

Supersedes 0.1.0 below, which stays as the record of the first publish. 0.1.0
is still resolvable by exact version; `latest` now points here.

| | |
|---|---|
| Package | `leash-agentpay@0.2.0`, public, tag `latest` |
| Contents | 4 files — `dist/index.js` (41.3 kB), `package.json`, **`README.md`**, **`LICENSE`** |
| Packed size | 15.3 kB (48.7 kB unpacked) |
| shasum | `244857ec48798f46bf122d3dd3ad1537fb2aa39a` |
| Publisher | npm account `vanhuy1999` |

Two reasons for the release.

**The package page was blank.** `files: ["dist"]` shipped two files and nothing
else, so `npm view leash-agentpay readme` answered *"No README data found!"* —
a stranger reaching the registry page learned nothing about what the server
does, how to configure it, or that `OPERATOR_PK` is a hot key. npm only picks
up a README that sits in the package directory, and the repo's 15 kB root
README is not that. `"license": "MIT"` was declared with no LICENSE text
beside it, and there was no `author`.

**Three reporting defects were fixed.** `leash_pay` claimed `ok: true, paid`
the instant a transaction was sent; a node that could not be reached was
reported as a policy refusal; and the x402 draw was signed against before the
money it drew had arrived. All three are in the commits between `adc9db4` and
`aed917f`.

Minor rather than patch because `leash_pay`'s return shape changed: `ok: true`
is no longer given on send, and `spend_reverted`, `sent_unconfirmed` and
`policy_unreadable` are new. Pre-1.0, a breaking change is a minor bump.

### Verified, not assumed

Read back from the registry, and the tarball fetched from it rather than
trusting the publish output:

```
$ npm view leash-agentpay version dist-tags
version = '0.2.0'
dist-tags = { latest: '0.2.0' }

$ npm view leash-agentpay readme | head -1
# leash-agentpay

$ npm pack leash-agentpay@0.2.0 && tar tzf leash-agentpay-0.2.0.tgz
package/LICENSE
package/dist/index.js
package/package.json
package/README.md

$ shasum leash-agentpay-0.2.0.tgz
244857ec48798f46bf122d3dd3ad1537fb2aa39a
```

That shasum is the one npm printed at publish time, so the bytes on the
registry are the bytes that were built. Every new branch is present in the
registry's own copy of the bundle — `sent_unconfirmed`, `spend_reverted`,
`policy_unreadable`, `draw_unconfirmed`, `preferAsset` and `DO NOT RETRY` all
grep out of `package/dist/index.js`.

**Superseded within the hour by 0.2.1.** The walk that would have closed this
entry's open question was run against 0.2.0 and found a defect instead — see
the 0.2.1 entry above. `latest` has moved; 0.2.0 remains resolvable by exact
version and should not be used.

## npm — `leash-agentpay@0.1.0`, published 2026-09-06

The MCP server had never been installable. Until this entry the only way to run
it was to clone this repository, `pnpm install` under a pinned pnpm, and edit an
absolute path into `.mcp.json` by hand.

| | |
|---|---|
| Package | `leash-agentpay@0.1.0`, public, tag `latest` |
| Registry | <https://registry.npmjs.org/leash-agentpay> |
| Contents | 2 files — `dist/index.js` (36.9 kB) and `package.json`. No `src/`, no tests. |
| Packed size | 11.3 kB (38.0 kB unpacked) |
| shasum | `643ec7a1c1f4749fe15b8fcd6b6402d5e276d900` |
| Publisher | npm account `vanhuy1999` |

`@leash/sdk` is bundled in rather than published beside it: it has one consumer,
and publishing it would commit this project to a public API and a semver
contract nobody has asked for. It is also a `devDependency` rather than a
dependency, because `@leash/sdk` on the registry is an **unrelated project** —
leaving it a real dependency would have made every user's install fetch a
stranger's code.

### Verified, not assumed

Read back from the registry after publishing, from a temporary directory
outside this repository and with the npm cache cleared:

```
$ npm view leash-agentpay version dist-tags
version = '0.1.0'
dist-tags = { latest: '0.1.0' }

$ npx -y leash-agentpay
Error: OPERATOR_PK is not set. The Leash MCP server needs it to start.
```

That error is the pass condition, not a failure: it proves npm resolved the
package, linked and executed the bin, and reached `loadConfig` — the real
entrypoint. A module-resolution error instead would have meant the bundle was
broken.

The bin was separately verified **by name** rather than by path, since
`mcp/test/bundle.test.ts` invokes an explicit `dist/index.js` and so proves
nothing about the command resolving: installing the tarball into a temporary
prefix created `node_modules/.bin/leash-agentpay`, and running `leash-agentpay`
with that directory on `PATH` reached the same configuration error.

### Two things that cost a round each

1. **`npm publish --dry-run` warned that the bin had been "invalid and
   removed".** It had not been: the manifest inside the tarball kept it and the
   install linked it. npm's normalizer simply prefers `dist/index.js` over
   `./dist/index.js`. The prefix was dropped anyway — a frightening line printed
   on every publish teaches whoever runs it to skim publish output.

2. **A `npm login` web session cannot publish on a 2FA account.** It issues a
   classic token, and npm now refuses those for direct publishing: `403 ...
   Two-factor authentication or granular access token with bypass 2fa enabled is
   required`. Supplying `--otp` did not change it. A granular access token with
   bypass-2FA is what worked.

### The stranger's install, timed (2026-09-07)

Task 6 asks for a measurement rather than a claim. The half that needs a wallet
and a browser is still unwalked — see below. The half a machine can do was run
cold: an empty directory, a private npm cache created for the run so nothing on
this machine could have been serving a warm copy.

```
[0.0s] clean dir /var/folders/.../leash-registry-6Rewa7, cold cache /var/folders/.../leash-npmcache-vwhuQb
added 111 packages in 7s
[6.8s] npm install leash-agentpay (from the registry, cold cache) finished
bin present: true
installed version: 0.1.0
@leash/sdk on disk: false
[7.6s] server connected over stdio
tools: leash_status, leash_pay, leash_fetch
[7.7s] leash_fetch quote_only returned
payload: { "ok": true, "price": "0.010000", "price_atomic": "10000", ... "within_max": true }
```

Three things this shows that `mcp/test/bundle.test.ts` cannot, because that
suite packs a local tarball rather than resolving the published one:

- **`@leash/sdk` is not on disk.** The inlining held all the way through the
  registry. This is the hazard the whole bundling decision exists for: had
  `noExternal` failed, npm would have installed the unrelated `@leash/sdk`
  owned by somebody else, and it would have installed *successfully*.
- **`leash_fetch` works through a real install.** It is the only tool whose SDK
  import is dynamic, so it is the only one that can fail while the other two
  pass. `quote_only` touches no chain and spends nothing.
- **6.8 seconds, 111 packages.** Whatever the wallet half of the walk costs, the
  install is not where the time goes.

### The wallet half, walked 2026-09-07

A second `SpendPolicyAccount` was deployed through the hosted wizard and driven
end to end by a real agent. Read off the chain, not taken from the wizard:

| | |
|---|---|
| Account | `0x7757035dd318eF1FC878bD83B06EE46eF3Ae0d9c` |
| Owner | `0x94f7268ca8b29d536f8c5cd0753753d55Fb06459` |
| Operator | `0xd44daF6Db6c8057c206E6aCC27e6384B8ec850D6`, `operators()` = true |
| Per-tx cap | 0.50 USDC · **Daily cap** 5.00 USDC |
| Account balance | 1.00 USDC · **Operator** 0.041078 USDC, **0 CELO** |
| Allowlist | disabled · **Paused** false |

Then, through the published package rather than a script — `npx -y
leash-agentpay` started by the agent's own MCP client, reading the same
`.mcp.json` the wizard emitted:

- `leash_status` returned the table above. The first time an agent has reached
  this project's chain state through an install rather than a checkout.
- `leash_fetch` against `https://usebuy.ai/gcloud/vm` with `quote_only: true`
  quoted **0.016753 USDC**, `within_max: true`, nothing paid.

That price is the same `16753` recorded in the x402 section below, from the
purchase that actually settled. Same endpoint, same price, reached this time
through the registry.

**Why the `leash_fetch` line is the one that matters.** It is the only tool
whose `@leash/sdk` import is dynamic, and it sits inside that tool's branch
alone. A bundle that left the import external serves `leash_status` and
`leash_pay` perfectly and dies only here — on a user's machine, on a path no
suite in this repository resolves honestly, because vitest reaches `@leash/sdk`
through the workspace symlink whatever the bundler did. Task 1's `noExternal`,
Task 2's tarball test and CI's `bundle` job all exist for this one failure.
This call is the first time the whole chain was exercised as a stranger meets
it: registry → `npx` → MCP stdio → agent → a real 402 endpoint.

**Two honest limits on this measurement.**

1. **No wall-clock time was recorded.** The walk was not timed, so no duration
   is claimed here and none is added to `README.md`. Somebody who wants the
   number has to walk it again with a clock running.
2. **The operator wallet was reused, not created.** `0xd44daF6D…850D6` is the
   registered `agentWalletAddress` from `docs/registration.md` — required, since
   x402 attributes settlements to it. So this walk skipped generating an
   operator wallet and funding it for gas. A real stranger pays that cost and
   this measurement does not include it.

### The step the setup guide did not have

The walk failed once, silently, and the cause was not in this project at all.

A project-scoped `.mcp.json` is not trusted on sight: the agent asks before
running anything the file names. That prompt was answered "no", and the
consequence is that the tools **simply do not exist** — no error, no warning,
nothing in the agent's output distinguishing "rejected" from "you edited the
wrong file". Restarting does not re-ask. `claude mcp list` does not list the
server at all in that state; only `claude mcp get leash` names it, as
`✘ Rejected`, and only `claude mcp reset-project-choices` clears it.

`docs/mcp-setup.md` now carries the step and the diagnosis. It is the same
failure shape as the absolute path the wizard used to emit: the user sees "the
server does not work" and the real cause is somewhere they are not looking.
