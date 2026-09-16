export type Proof = {
  claim: string
  /**
   * Why the transaction proves the claim, consequence first.
   *
   * Every one of these used to open on an identifier -- `remainingToday`,
   * `celo_3dec652cd977`, `solc 0.8.24` -- because that is the order the person
   * who earned the proof thinks in. It is the wrong order for the person
   * reading it. Rendering these on the landing page (1701ba1) put six of them
   * in front of a reader who may not know what a proxy is, and the first
   * clause of each was the most technical thing in the sentence.
   *
   * So each now leads with what a reader gains or is protected from, and the
   * evidence follows the colon. The figures are unchanged: this is the order,
   * not the content.
   */
  detail: string
  /** The explorer URL, not a bare hash. The pre-commit secret guard exempts
   *  `/tx/0x…` but blocks a bare `0x`+64-hex behind a `txHash:` key, and
   *  this file carries five real mainnet hashes. */
  url: string
}

export function explorerUrl(hash: string): string {
  return `https://celoscan.io/tx/${hash}`
}

/** '0x3fb0324f…a851f70' for display, derived from the stored URL so the hash
 *  is written down exactly once. */
export function shortHash(url: string): string {
  const h = url.slice(url.lastIndexOf('/') + 1)
  return `${h.slice(0, 10)}…${h.slice(-7)}`
}

/**
 * The six things this project has proven rather than asserted, every one of
 * them against the live v2 account. Five transactions carry six claims.
 *
 * **These were the pre-v2 hashes until 2026-09-16, and three of them pointed
 * at deployments CLAUDE.md forbids.** The header here said the set was read
 * off mainnet on 2026-09-04; v2 was deployed on 2026-09-12, and this file was
 * never revisited. Read back from forno on 2026-09-16, the old set resolved
 * like this:
 *
 *   policy-gated spend + attribution  ->  0x895B773E…  superseded 2026-09-03
 *   deployed and source-verified      ->  created 0x7aDa926B…  v1, superseded
 *
 * So the landing page's evidence panel -- the part of the product that exists
 * to say "not merely asserted" -- was asserting things about contracts that
 * are no longer the live one, and linking a reader to them. docs/deployments.md
 * had carried the v2 equivalents since 2026-09-12 under "What v2 was proved to
 * do"; nothing had copied them here.
 *
 * Every hash below was read back off mainnet on 2026-09-16, returned status 1,
 * and resolves to 0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d -- except the
 * settlement, which is an EIP-3009 transfer submitted by the facilitator and
 * so names the USDC token as its target. That is the claim, not a mismatch.
 *
 * Several came back null on a first request and answered on a retry -- the
 * load-balanced forno staleness this repo documents. Retry before concluding
 * a proof is wrong. The figures in each `detail` are read from
 * docs/deployments.md, which took them at the transaction's own block rather
 * than after its receipt.
 */
export const PROOFS: readonly Proof[] = [
  {
    claim: 'The policy gates a real spend',
    detail: 'The cap governed the transfer rather than merely coexisting with it: remainingToday, the account and the payee each moved by exactly 10000 — one hundredth of a USDC — read at the block before against the block itself.',
    url: 'https://celoscan.io/tx/0x11cc0100809084880c68b401668dfa46b3eaf32d61bea43fa40ee897dc8246fc',
  },
  {
    claim: 'The attribution tag round-trips',
    detail: 'The tag survives the trip to the chain and back, rather than being taken on trust from what the sender says it sent: that same spend decodes to celo_3dec652cd977 straight from raw chain data.',
    url: 'https://celoscan.io/tx/0x11cc0100809084880c68b401668dfa46b3eaf32d61bea43fa40ee897dc8246fc',
  },
  {
    claim: 'An agent spent through the policy, with no human naming the amount',
    detail: 'No human typed an amount or a payee: an agent in a separate session, handed the account and nothing else, called leash_pay. remainingToday, the account and the payee each moved by exactly 100000.',
    url: 'https://celoscan.io/tx/0x3cb307a4fde990a3f9282348999127daf022f4caea264af16426595158148704',
  },
  {
    claim: 'x402 paid with money drawn through the policy',
    detail: 'A purchase is bounded like any other spend: the agent paid 16753 for a metered resource, drew 17330 to afford it, and remainingToday and the account both fell by exactly the draw.',
    url: 'https://celoscan.io/tx/0xd03c3b264129ba303bc394f8cfbaedad545ca4813b6e0fc6c1a12447d2baa807',
  },
  {
    claim: 'The facilitator settled it, and the agent held zero CELO throughout',
    detail: 'The agent never needed the chain’s own coin: it held 0 CELO throughout and paid its fees in USDC. This one was submitted by the facilitator rather than by us.',
    url: 'https://celoscan.io/tx/0xedd104e390d32c0d96b0b1c5e07365e2688344ee4905c3d7f3092d21815865ef',
  },
  {
    claim: 'The contract is deployed and source-verified',
    detail: 'The rules cannot be changed behind you: not a proxy, and not upgradeable. solc 0.8.24, with verification confirmed by forge verify-check rather than inferred from the submission returning OK.',
    url: 'https://celoscan.io/tx/0xad28ee0dc8a25bc9e1896fed8bde1d3dd88804f3f4f93a5eb96c4f32422e7449',
  },
]
