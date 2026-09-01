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
