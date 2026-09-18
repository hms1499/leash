/** Discovered on-chain by spikes/fee-currency.ts. Do not edit by hand. */
export const FEE_CURRENCY_DIRECTORY = '0x15F344b9E6c3Cb6F0376A36A64928b13F62C6276' as const

export const KNOWN_FEE_ADAPTERS = [
  '0x765DE816845861e75A25fCA122bb6898B8B1282a', // USDm
  '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73', // EURm
  '0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787', // BRLm
  '0x73F93dcc49cB8A239e2032663e9475dd5ef29A08', // XOFm
  '0x0E2A3e05bc9A16F5292A6170456A710cb89C6f72', // USD₮ (Tether USD)
  '0xD221812de1BD094f35587EE8E174B07B6167D9Af', // WETH
  '0x456a3D042C0DbD3db53D5489e98dFb038553B0d0', // KESm
  '0x105d4A9306D2E55a71d2Eb95B81553AE1dC20d7B', // PHPm
  '0x8A567e2aE79CA692Bd748aB832081C45de4041eA', // COPm
  '0xfAeA5F3404bbA20D3cc2f8C4B0A888F55a3c7313', // GHSm
  '0xCCF663b1fF11028f0b19058d0f7B674004a40746', // GBPm
  '0x4c35853A3B4e647fD266f4de678dCc8fEC410BF6', // ZARm
  '0xff4Ab19391af240c311c54200a492233052B6325', // CADm
  '0x7175504C455076F15c04A2F90a8e352281F492F9', // AUDm
  '0xb55a79F398E759E43C95b979163f30eC87Ee131D', // CHFm
  '0xE2702Bd97ee33c88c8f6f92DA3B733608aa76F71', // NGNm
  '0xc45eCF20f3CD864B32D9794d6f76814aE8892e20', // JPYm
  '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B', // USDC adapter (underlying token 0xcebA9300f2b948710d2653dD7B07f33A8B32118C)
  '0x0357EE22278c922e1D36cFe6b899269b161880C4', // USA₮ (Tether America USD)
  '0x857BF24e29da0773687E804a743c2E421a394C16', // XAUt0
] as const satisfies readonly `0x${string}`[]

/**
 * USDC on Celo mainnet — the token this project is built and proven against.
 *
 * It lives here because it was a bare hex literal in five places that had no
 * way to disagree loudly: four in `app/` (`lib/ownedAccounts.ts`,
 * `components/landing/LiveProof.tsx`, `app/setup/page.tsx`,
 * `app/a/[address]/page.tsx`) and once more in every `.mcp.json` a user was
 * asked to paste by hand. A transposed character in the last of those is the
 * expensive one: `limits()` answers `0/0/0` for a token no policy was ever set
 * on, so `leash_status` reports a cap of zero and nothing anywhere says why.
 *
 * `SpendPolicyAccount.setPolicy` is per-token, so this is a default and not an
 * assumption — `SPEND_TOKEN` still overrides it.
 */
export const CELO_USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const

/**
 * The fee-currency adapter for {@link CELO_USDC}, and the one entry of
 * {@link KNOWN_FEE_ADAPTERS} the product actually defaults to.
 *
 * NOT the token above. It is a FeeCurrencyWrapper: it holds nothing, and
 * symbol(), name(), decimals() and getAdaptedToken() all revert on it. It
 * exists because USDC has 6 decimals where Celo's fee-currency mechanism wants
 * 18, and it is what makes "the agent needs no CELO at all" true — the
 * operator signs CIP-64 (type 0x7b) envelopes naming it as `feeCurrency`.
 *
 * Verified against the FeeCurrencyDirectory on 2026-09-02 (spikes/README.md
 * T0.1, 20 adapters) and again on 2026-09-09; getCurrencyConfig reports oracle
 * 0xefB84935…7b33, intrinsicGas 128,000.
 */
export const CELO_USDC_FEE_ADAPTER = '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' as const

/**
 * The ERC-8021 code that represents this project, issued by Celo Builders on
 * registration (docs/registration.md).
 *
 * It is a constant and not configuration because of the layering rule in
 * `@celo/attribution-tags`: *each code is added only by the entity it
 * represents, and your app emits its own code.* A transaction built and signed
 * by `leash-agentpay` was emitted by this app whoever is running it, so this
 * code belongs on it — the same way a MiniPay transaction carries MiniPay's
 * code regardless of which app is inside the wallet.
 *
 * It was an environment variable until 0.5.0, which asked every user to supply
 * a value representing something they were not. The advice in its place was to
 * invent twelve random hex characters, and a code invented that way represents
 * nobody at all — strictly less true than this one, and one more field between
 * a reader and a working agent.
 *
 * A builder shipping their own product on top of this server sets
 * `ATTRIBUTION_TAG` and gets both codes in one suffix. That is the layering the
 * rule describes, not an exception to it.
 */
export const LEASH_ATTRIBUTION_CODE = 'celo_3dec652cd977' as const

/** The shape Celo Builders issues, and the only one `ATTRIBUTION_TAG` accepts. */
export const ATTRIBUTION_CODE_SHAPE = /^celo_[0-9a-f]{12}$/
