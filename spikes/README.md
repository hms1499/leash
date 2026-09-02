# Spikes

Throwaway scripts that verify chain-level assumptions. Findings are recorded
here; the code is not production code.

## T0.1 — stablecoin gas from a zero-CELO wallet

Result: PASS (2026-09-02)

FeeCurrencyDirectory: `0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276` (Celo mainnet, chain id 42220)

Source: [Celo docs — Core Contracts](https://docs.celo.org/tooling/contracts/core-contracts) (canonical URL `https://docs.celo.org/contract-addresses`), row `FeeCurrencyDirectory`, linking to `https://celo.blockscout.com/address/0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276`. Verified on-chain (see Step 1/3 commands below) before use — a naive WebFetch summary of the same page had earlier corrupted this address to a 41-hex-char string; the raw HTML was pulled with `curl` and grepped directly to get the exact bytes, which then matched a successful `cast call`.

Adapters discovered (20, via `getCurrencies()` on the directory above):

| feeCurrency / adapter address | symbol() (on-chain) | notes |
|---|---|---|
| 0x765DE816845861e75A25fCA122bb6898B8B1282a | USDm | Mento Dollar |
| 0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73 | EURm | Mento Euro |
| 0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787 | BRLm | Mento Brazilian Real |
| 0x73F93dcc49cB8A239e2032663e9475dd5ef29A08 | XOFm | Mento West African CFA franc |
| 0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72 | USD₮ | Tether USD (Celo-native) |
| 0xD221812de1BD094f35587EE8E174B07B6167D9Af | WETH | Wrapped Ether |
| 0x456a3D042C0DbD3db53D5489e98dFb038553B0d0 | KESm | Mento Kenyan Shilling |
| 0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B | PHPm | Mento Philippine Peso |
| 0x8A567e2aE79CA692Bd748aB832081C45de4041eA | COPm | Mento Colombian Peso |
| 0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313 | GHSm | Mento Ghanaian Cedi |
| 0xCCF663b1fF11028f0b19058d0f7B674004a40746 | GBPm | Mento British Pound |
| 0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6 | ZARm | Mento South African Rand |
| 0xff4Ab19391af240c311c54200a492233052B6325 | CADm | Mento Canadian Dollar |
| 0x7175504C455076F15c04A2F90a8e352281F492F9 | AUDm | Mento Australian Dollar |
| 0xb55a79F398E759E43C95b979163f30eC87Ee131D | CHFm | Mento Swiss Franc |
| 0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71 | NGNm | Mento Nigerian Naira |
| 0xc45eCF20f3CD864B32D9794d6f76814aE8892e20 | JPYm | Mento Japanese Yen |
| 0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B | *(reverts)* | USDC fee-currency adapter — not itself an ERC20; `symbol()`/`name()`/`decimals()` all revert. Underlying USDC token is `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (`symbol()` → `USDC`, confirmed on-chain). This is the expected "adapter" shape docs describe for non-18-decimal tokens. |
| 0x0357EE22278c922e1D36cFe6b899269b161880C4 | USAT | Tether America USD ("USA₮" per docs table) |
| 0x857BF24e29da0773687E804a743c2E421a394C16 | XAUt0 | Tether Gold-pegged (XAUt0) |

Cross-checked: this on-chain list matches the "feeCurrency Address" column of the
[Celo Fee Currencies](https://docs.celo.org/tooling/contracts/fee-currencies) docs table
address-for-address (20/20), confirming the docs table and the live contract agree.

Proof tx: 0x1d10d9cb683563e2a34bb5a7d44a7f1320806befa58d978b6fe2a39f92146595
(https://celoscan.io/tx/0x1d10d9cb683563e2a34bb5a7d44a7f1320806befa58d978b6fe2a39f92146595)

A wallet holding **exactly zero CELO** sent a transaction on Celo mainnet and
paid for it in USDC. Reproduce with `spikes/zero-celo-send.ts`.

Getting there took two transactions, because the claim is about a wallet that
holds nothing, and the operator still held 0.128 CELO left over from the
ERC-8004 mint. A CELO-paid sweep can never reach zero — the node reserves
`gasLimit * maxFeePerGas` regardless — so the sweep itself paid gas in USDC:

| step | tx | result |
|---|---|---|
| sweep 0.1282678 CELO to the owner, gas in USDC | hash 0x8f4766f5156c101033e7b32063c57593f83b7add9e5b57b2e266d995f6cd95e2 | operator CELO → 0 |
| tagged send from the emptied wallet, gas in USDC | hash 0x1d10d9cb683563e2a34bb5a7d44a7f1320806befa58d978b6fe2a39f92146595 | success, 149548 gas |

Verified from the chain rather than from the script's own output: the operator's
CELO balance reads 0 before and after the send, the transaction envelope is type
`0x7b` (CIP-64) carrying `feeCurrency` `0x2F25deB3…602B`, the owner's balance
rose by the swept amount, and the raw `input` decodes through `fromDataSuffix`
to `{"codes":["celo_3dec652cd977"],"schemaId":0}`.

Cost: 2228000000000000 adapter units = **$0.00223** of USDC for the tagged send.
An earlier fee-currency send from the same wallet while it still held CELO left
that CELO balance byte-for-byte unchanged, which is the same fact from the other
direction — CELO is not touched even when it is there to be touched.

### forno rejects fee-currency sends non-deterministically

Measured while doing the above, and it will bite anything that sends with a fee
currency. Backends behind `forno.celo.org` disagree about the fee-currency gas
price. The same `maxFeePerGas` is rejected by one node with `-32000: max fee per
gas less than block base fee` and accepted by the next; consecutive reads of
`eth_gasPrice` with a fee currency returned 14957340930 and 14956718850. A
sweep of candidate values looked at first like a threshold — 14.957 gwei passed
while 17.9, 20, 25, 30, 35.67 and 40 all failed — until the same values were
retried and the result inverted. There is no threshold. It is flakiness.

The failure happens inside gas estimation, before anything is signed, so a retry
is safe. `spikes/zero-celo-send.ts` retries up to 8 times and re-reads the nonce
before every attempt, aborting rather than re-sending if it ever moved.

### Adapters report balances rescaled to 18 decimals

Measured 2026-09-02, and it decides how a fee-currency balance map must be
built. `balanceOf` works on an adapter even where `symbol()`, `decimals()` and
`getAdaptedToken()` all revert (the USDC adapter is such a case), and the figure
it returns is rescaled to 18 decimals:

| holder `0xcd437749e43a154c07f3553504c68fbfd56b8778` | value |
|---|---|
| `balanceOf` on the USDC token `0xceb...118C` (6 dp) | 58553610 |
| `balanceOf` on the USDC adapter `0x2F25...602B` | 58553610000000000000 |

Same money, two scales. `pickFeeAdapter` compares balances across adapters, so
the map it is given must be read from the ADAPTER addresses. Building it from
the underlying tokens would compare a 6-decimal figure against an 18-decimal one
and pick the wrong currency — silently, and only for non-18-decimal tokens.

### What was skipped

Step 4 (send a real `cast send ... --fee-currency ...` transaction from a funded
zero-CELO EOA) was intentionally **not** performed in this pass. It requires a
private key and real testnet/mainnet funds that this run does not have and must
not request. A human partner needs to fund a fresh EOA with a small amount of one
of the adapters above (e.g. USDC via `0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B`),
send **zero CELO** to it, then run:

```bash
cast send <ANY_RECIPIENT> --value 0 \
  --fee-currency 0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B \
  --private-key $SPIKE_PK \
  --rpc-url https://forno.celo.org
```

and confirm on Celoscan that the tx succeeded and the sender's CELO balance was
and remains zero, then update this record's `Result` and `Proof tx` lines.

## T0.2 — can a contract account sign EIP-3009 for x402?

Result: ERC-1271 SUPPORTED

Tokens inspected:
- Celo-native USDC: proxy `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (Circle `FiatTokenProxy`), implementation `FiatTokenCeloV2_2` at `0xdA06D4e3F59fE2C8ff3077A9D50D5BE5E231BEcD`.
- Celo-native USDT: proxy `0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e` (this is the *underlying* token behind the whitelisted fee-currency adapter `0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72`, which is itself a `FeeCurrencyWrapper`, not the token — its `getAdaptedToken()` returns this address), implementation `TetherTokenCeloExtension` at `0xBF83F8436Ac46A8B1da5A9348eD84F68aEe07B98`.

Evidence: verified source pulled via Blockscout's `smart-contracts` API
(`https://celo.blockscout.com/api/v2/smart-contracts/<address>`, which returns
`source_code` + `additional_sources` straight from the verifier — not a
model-summarised page). Both tokens' `EIP3009.sol` route signature checks
through a `SignatureChecker.isValidSignatureNow(signer, digest, signature)`
helper that explicitly branches:

```solidity
function isValidSignatureNow(address signer, bytes32 digest, bytes memory signature)
    ... returns (bool)
{
    if (!isContract(signer)) {
        return ECRecover.recover(digest, signature) == signer;
    }
    return isValidERC1271SignatureNow(signer, digest, signature);
}
```
(Circle USDC `util/SignatureChecker.sol`; Tether USDT's copy is
byte-for-byte the same logic under `contracts/Tether/util/SignatureChecker.sol`,
credited "Adapted by Tether.to 2024" from Circle's original.)

`isValidERC1271SignatureNow` does a `staticcall` to
`IERC1271.isValidSignature.selector` on the signer and checks the magic-value
return — the standard ERC-1271 pattern. USDC's `FiatTokenV2_2.transferWithAuthorization`
(and `receiveWithAuthorization`, `cancelAuthorization`, `permit`) all take a
`bytes memory signature` parameter (doc comment: "Signature bytes signed by an
EOA wallet or a contract wallet") and forward straight into this checker via
`_requireValidSignature` in `EIP3009.sol`. Full source pulled to
`/private/tmp/.../scratchpad/{EIP3009.sol,SignatureChecker.sol,FiatTokenV2_2.sol}`
during the spike (not checked into the repo; ephemeral scratch).

Empirical check (confirms EIP-3009 surface is live on-chain, does not itself
distinguish ecrecover vs ERC-1271 — that came from source):
```
$ cd spikes && TOKEN=0xcebA9300f2b948710d2653dD7B07f33A8B32118C pnpm exec tsx x402-contract-signature.ts
domain separator: 0xb2ce31d2838445fa765a491f550e7c78ac7280ab0f3bc9d6063a86df9c3fb578
token exposes EIP-3009 surface: true

$ cd spikes && TOKEN=0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e pnpm exec tsx x402-contract-signature.ts
domain separator: 0xbcb4d62e4834b598d0eacecd84c0b397a0254e077c41cf2143e394d5701d1088
token exposes EIP-3009 surface: true
```
Note: `pnpm -F spikes exec tsx x402-contract-signature.ts` run from the repo
root also worked in this environment (contrary to the brief's warning that it
doubles the path) — but `cd spikes && pnpm exec tsx <file>` is the form used
above and is unambiguous either way.

Consequence:
- ERC-1271 SUPPORTED -> Path A covers x402. Update spec section 2.1.
- ECRECOVER ONLY     -> Path B (metered top-up) is the x402 route, as designed.

Confidence: high. Both independently-authored, independently-deployed
stablecoins on Celo mainnet route `transferWithAuthorization` signature
verification through an ERC-1271-aware checker when the payer (`from`) address
has code, confirmed directly from each token's own verified implementation
source (not a WebFetch summary). This is a **necessary but not sufficient**
condition: it means the token itself will accept a contract signature. Not yet
verified in this spike: (a) whether Leash's actual smart-contract wallet
implementation would need to *implement* `isValidSignature` itself (it would —
ERC-1271 support is opt-in per contract, so Leash's wallet contract must expose
a compliant `isValidSignature(bytes32,bytes)`); (b) whether the specific x402
facilitator/relayer software Leash intends to use forwards a `bytes` signature
parameter (as opposed to hardcoding a `(v,r,s)` 65-byte split that happens to
still work here since ERC-1271 checks accept an arbitrary-length `bytes`
signature, including a 65-byte one) — worth a follow-up check against the
actual facilitator client library before finalizing Path A.

## T0.3 — attribution tag round-trip

Result: PASS

Tag: `celo_3dec652cd977`

Proof tx: 0xb91ba35708c21b9fb1454eac7d5ff2dc5e8f8bfdb5ec00eac8f079e5d2e9fca4
(https://celoscan.io/tx/0xb91ba35708c21b9fb1454eac7d5ff2dc5e8f8bfdb5ec00eac8f079e5d2e9fca4)
Celo mainnet, block-confirmed, status success, 22370 gas. Sender and recipient
are both the operator EOA `0xd44daF6D`, value 0 — the transaction exists only to
carry the suffix.

verifyTx output: `{"codes":["celo_3dec652cd977"],"schemaId":0}`

Suffix written: `0x63656c6f5f336465633635326364393737110080218021802180218021802180218021`

Verified twice, and the second time without the spike's help: the raw `input`
was pulled back off the chain with `cast tx` and decoded through
`fromDataSuffix` in a separate process. It yields the same single code, the code
matches the tag registered with celobuilders, and the ERC-8021 marker
`0x80218021...8021` terminates the calldata.

### What this does and does not establish

Established: a tag written with `toDataSuffix` survives a real mainnet
transaction and reads back through `verifyTx`. The call pattern is the one the
SDK already uses in `sdk/src/attribution.ts`.

NOT established: that gas can be paid in a stablecoin from a zero-CELO wallet.
That is T0.1's question and it remains open. This transaction paid gas in CELO,
because neither the operator nor the owner EOA holds any of the 20 whitelisted
fee currencies — checked directly, all zero. The spike selects a funded adapter
automatically and falls back to CELO only when it finds none, so re-running it
once the operator holds USDC proves both legs at once.

## T3.0 — settling a real x402 payment on Celo from our own code

Result: **PASS**

Settlement tx: 0x0ac87832e1da72bbf4a76d30d1e696b236ee13b7a172cb5eb87352ce7682b46e
(https://celoscan.io/tx/0x0ac87832e1da72bbf4a76d30d1e696b236ee13b7a172cb5eb87352ce7682b46e)

Paid 0.016753 USDC for an `e2-micro` Google Cloud VM through the gateway at
`usebuy.ai`, and got the work back:

```
Linux cpay-0ac87832e1da 6.1.0-52-cloud-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.180-1 x86_64
2
```

That is `uname -a; nproc` run on a real machine the agent rented and paid for
itself. Balances agree exactly: the operator went from 1047547 to 1030794
atomic USDC, a difference of 16753, and its CELO balance stayed at zero.

Reproduce with `spikes/x402-pay.ts`. `DRY_RUN=1` builds and prints the payment
without sending it, which costs nothing and spends none of the free settlements.

### Shipped, and proved again through the policy (2026-09-02)

This hand-rolled client is no longer a spike: it lives in `sdk/src/x402/` and is
what `leash_fetch` calls. It has since bought the same resource with money drawn
through `topUpOperator`, which this spike did not do — T3.0 paid from the
operator's own leftovers and never touched the contract.

- Top-up tx: https://celoscan.io/tx/0xec08a20020983992d18d6faa7cccd91e0bba0f2432e6f22e534616b96f2f33db
- Settlement tx: https://celoscan.io/tx/0xb5dd4d16a7e65453ddcdc70b235384a7bc20c8845a8ce5096084c7f7f2a91e25

Two mainnet facts came out of that run and are written up in
`docs/deployments.md`: a `feeCurrency` send with no gas limit reserves the
**block** gas limit (0.465 USDC against 0.0022 spent), and a draw sized to the
bare shortfall cannot pay, because the draw spends its own gas out of the
balance it just topped up.

### The standard x402 client cannot do this

`x402@1.2.0` lists fifteen supported EVM networks — abstract, base, avalanche,
iotex, sei, polygon, peaq, story, educhain, skale and their testnets — and
**celo is not among them**. Both the signer and `encodePayment` gate on
`SupportedEVMNetworks.includes(network)`, so `x402-fetch` and `x402-axios`
reject this gateway's challenge outright. Finding this before writing `T3.1`
rather than during it is the entire return on this spike.

The protocol itself is reimplementable in about a hundred lines, because the
challenge publishes everything needed:

| field | value |
|---|---|
| `scheme` | `exact` |
| `network` | `celo` |
| `asset` | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` (USDC) or `0x48065fbB…` (USDT) |
| `payTo` | `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` |
| `extra.name` / `extra.version` | the token's EIP-712 domain — published nowhere else |

Sign an EIP-3009 `TransferWithAuthorization` over that domain, base64 the
`{x402Version, scheme, network, payload:{signature, authorization}}` object, and
send it as `X-PAYMENT`.

### Who pays the gas — a correction

The gas is paid by the **facilitator**, not by us, and this is true of our own
client just as much as of Celo's `buy`. The settlement transaction was submitted
by `0xf8d2cc13…`, is a plain type `0x2` transaction with `feeCurrency` null, and
our operator's CELO balance was zero before it and zero after.

An earlier reading of the rules — that using `buy` would forfeit our fee
contribution while a hand-rolled client would preserve it — was wrong. The
choice of client does not change who pays gas. What a hand-rolled client
actually buys is independence from a closed-beta tool and control of the payment
flow, which is what lets x402 be wired to Path B at all.

This project's fee contribution comes from its **own** transactions, where the
operator pays gas in USDC from a zero-CELO wallet. That evidence is `T0.1` and
stands on its own.

### The attribution tag is not in an x402 settlement

Confirmed by decoding the settlement's calldata: no ERC-8021 marker. The
facilitator builds that transaction, so nothing of ours rides in it. x402
activity is credited through the registered `agentWalletAddress` instead, and
the settlement response names our operator as `payer`. The two attribution
mechanisms are described in `docs/registration.md`; this is the one that is
retroactive.

### The facilitator uses the (v, r, s) overload

Selector `0xe3ee160e` =
`transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)`,
not the `bytes` overload `0xcf092995`. This partly answers the caveat left open
in `T0.2`: the facilitator splits the signature rather than forwarding it as
`bytes`. It does not by itself rule out an ERC-1271 contract payer, since
Circle's implementation repacks `(v, r, s)` before the signature check, but it
does mean any future Path A x402 work must verify that repacking rather than
assume a `bytes` signature reaches the token untouched.

### Gate details worth keeping

- `e2-micro` costs 0.016753 USDC and has `attestationRequired: false`.
  `e2-standard-2` and larger **require** Self identity attestation.
- An unpaid `POST` returns the 402 quote for free. Quote before paying: the
  request body sets the price.
- x402 has no refund primitive. A `5xx` can mean the payment already settled, so
  a failed purchase must never be blindly retried. `x402-pay.ts` makes exactly
  one attempt.
- The poll URL returned with a purchase is a **bearer capability** — anyone
  holding it can read the result and renew the lease at our expense. It is
  deliberately not recorded here.
