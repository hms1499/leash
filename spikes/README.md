# Spikes

Throwaway scripts that verify chain-level assumptions. Findings are recorded
here; the code is not production code.

## T0.1 — stablecoin gas from a zero-CELO wallet

Result: DISCOVERY COMPLETE — send-test PENDING (human partner, needs a funded zero-CELO wallet)

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

Proof tx: pending

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
