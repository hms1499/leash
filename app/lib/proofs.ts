export type Proof = {
  claim: string
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
 * The five things this project has proven rather than asserted. Mirrored in
 * README.md as prose; this is the source the app renders from.
 *
 * Every hash was read back off mainnet on 2026-09-04 and returned status 1.
 * One of them, the policy-gated spend, came back NOT_FOUND on a first receipt
 * request and null on one of four retries -- the load-balanced forno staleness
 * this repo documents. It is in block 76422123. Retry before concluding a
 * proof is wrong.
 */
export const PROOFS: readonly Proof[] = [
  {
    claim: 'The policy gates a real spend',
    detail: 'remainingToday fell by exactly the amount spent, so the cap governed the transfer rather than merely coexisting with it.',
    url: 'https://celoscan.io/tx/0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70',
  },
  {
    claim: 'The attribution tag round-trips',
    detail: 'The ERC-8021 suffix decodes to celo_3dec652cd977 off-chain and again straight from raw chain data.',
    url: 'https://celoscan.io/tx/0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70',
  },
  {
    claim: 'x402 paid with money drawn through the policy',
    detail: 'The agent rented a Google Cloud VM and the daily counter fell by exactly the draw. The caps apply to agent purchases, not only to plain transfers.',
    url: 'https://celoscan.io/tx/0xec08a20020983992d18d6faa7cccd91e0bba0f2432e6f22e534616b96f2f33db',
  },
  {
    claim: 'The facilitator settled it, and the agent held zero CELO throughout',
    detail: 'Submitted by the facilitator, not by us. The operator paid its own gas in USDC and its CELO balance was 0 before and after.',
    url: 'https://celoscan.io/tx/0xb5dd4d16a7e65453ddcdc70b235384a7bc20c8845a8ce5096084c7f7f2a91e25',
  },
  {
    claim: 'The contract is deployed and source-verified',
    detail: '3406 bytes, solc 0.8.24, not a proxy and not upgradeable. The owner can set policy, pause and sweep, and is deliberately not an operator.',
    url: 'https://celoscan.io/tx/0x8a6f4d8cfd9d49d22f3948af384f87ba169533d903e12885aa3296bc0a2fc779',
  },
]
