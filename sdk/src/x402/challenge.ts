import { getAddress, isAddress } from 'viem'

/** Terms this client is able to satisfy, normalised out of a raw challenge. */
export type X402Terms = {
  scheme: string
  network: string
  maxAmountRequired: bigint
  resource: string
  payTo: `0x${string}`
  asset: `0x${string}`
  maxTimeoutSeconds: number
  /** EIP-712 domain name of the payment token, from `extra.name`. */
  tokenName: string
  /** EIP-712 domain version of the payment token, from `extra.version`. */
  tokenVersion: string
  description: string
  /**
   * The accepted entry exactly as the gateway sent it.
   *
   * v2 makes the client echo the chosen entry back as `accepted`, byte for
   * byte. Everything above is normalised — `amount` renamed, addresses
   * checksummed, defaults filled in — so rebuilding the entry from those
   * fields would hand the facilitator something that is not what it offered.
   */
  raw: Record<string, unknown>
  /** v2's top-level `resource` block, echoed back alongside `accepted`. Absent in v1. */
  resourceInfo?: Record<string, unknown>
}

export type X402Challenge = { x402Version: number; accepts: X402Terms[] }

export class X402ChallengeError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'X402ChallengeError'
    this.code = code
  }
}

/**
 * Celo mainnet, under both names it is published as.
 *
 * v1 gateways say `celo`; v2 switched to CAIP-2 and says `eip155:42220`. Same
 * chain, same 42220 that `signPayment` puts in the EIP-712 domain — only the
 * spelling moved.
 */
const SUPPORTED_NETWORKS = ['celo', 'eip155:42220']
const SUPPORTED_SCHEME = 'exact'

/**
 * Validates a 402 body and normalises it.
 *
 * Every rejection here is a refusal to sign something we cannot reason about.
 * An unsupported network or scheme would produce a signature the facilitator
 * discards; a missing `extra` would produce one that is silently invalid,
 * because `extra.name` and `extra.version` are the payment token's EIP-712
 * domain and are published nowhere else.
 */
export function parseChallenge(body: unknown): X402Challenge {
  const b = body as { x402Version?: unknown; accepts?: unknown }
  if (typeof b?.x402Version !== 'number') {
    throw new X402ChallengeError('malformed_challenge', 'no x402Version in the 402 body')
  }
  if (!Array.isArray(b.accepts) || b.accepts.length === 0) {
    throw new X402ChallengeError('malformed_challenge', 'the 402 body accepts nothing')
  }

  const accepts = b.accepts.map((a: Record<string, unknown>, i) => toTerms(a, `accepts[${i}]`))

  return { x402Version: b.x402Version, accepts }
}

/**
 * Normalises one accepted entry, or throws saying which one and why.
 *
 * Shared by both versions: v2 renamed the price field and re-spelled the
 * network, and changed nothing else that reaches a signature.
 */
function toTerms(
  a: Record<string, unknown>,
  where: string,
  resourceInfo?: Record<string, unknown>,
): X402Terms {
  if (a.scheme !== SUPPORTED_SCHEME) {
    throw new X402ChallengeError(
      'unsupported_scheme',
      `${where} uses scheme "${String(a.scheme)}"; this client implements "${SUPPORTED_SCHEME}" only`,
    )
  }
  if (typeof a.network !== 'string' || !SUPPORTED_NETWORKS.includes(a.network)) {
    throw new X402ChallengeError(
      'unsupported_network',
      `${where} is on network "${String(a.network)}"; this client signs for ${SUPPORTED_NETWORKS.map((n) => `"${n}"`).join(' and ')} only`,
    )
  }
  const extra = (a.extra ?? {}) as { name?: unknown; version?: unknown }
  if (typeof extra.name !== 'string' || typeof extra.version !== 'string') {
    throw new X402ChallengeError(
      'missing_token_domain',
      `${where} carries no extra.name/extra.version; without the token's EIP-712 domain any signature we build is silently invalid`,
    )
  }
  if (typeof a.asset !== 'string' || !isAddress(a.asset)) {
    throw new X402ChallengeError('malformed_challenge', `${where}.asset is not an address`)
  }
  if (typeof a.payTo !== 'string' || !isAddress(a.payTo)) {
    throw new X402ChallengeError('malformed_challenge', `${where}.payTo is not an address`)
  }
  // v1 calls it maxAmountRequired, v2 calls it amount. Neither may be a number:
  // a JSON number cannot carry a uint256 without silently rounding it.
  const amount = a.maxAmountRequired ?? a.amount
  if (typeof amount !== 'string') {
    throw new X402ChallengeError('malformed_challenge', `${where} carries no string amount`)
  }
  return {
    scheme: a.scheme,
    network: a.network,
    maxAmountRequired: BigInt(amount),
    resource: String(a.resource ?? resourceInfo?.url ?? ''),
    payTo: getAddress(a.payTo),
    asset: getAddress(a.asset),
    maxTimeoutSeconds: typeof a.maxTimeoutSeconds === 'number' ? a.maxTimeoutSeconds : 300,
    tokenName: extra.name,
    tokenVersion: extra.version,
    description: String(a.description ?? resourceInfo?.description ?? ''),
    raw: a,
    resourceInfo,
  }
}

/**
 * Validates a v2 challenge, whose terms arrive in the `PAYMENT-REQUIRED` header.
 *
 * Unlike v1 this SKIPS entries it cannot sign for rather than rejecting the
 * whole challenge, and the difference is not cosmetic. A v2 gateway advertises
 * every chain it takes in one list: the fixture this was built against offers
 * thirteen, including Solana, Stellar and Algorand, whose `asset` is not an EVM
 * address at all. Applying v1's rule — throw on the first entry we dislike —
 * discards the challenge at index 0 and never reaches the Celo terms at index 8.
 *
 * Throwing only when nothing survives keeps the useful property: a challenge
 * this client genuinely cannot pay still fails loudly instead of signing
 * something wrong.
 */
export function parseChallengeV2(body: unknown): X402Challenge {
  const b = body as { x402Version?: unknown; accepts?: unknown; resource?: unknown }
  if (b?.x402Version !== 2) {
    throw new X402ChallengeError('malformed_challenge', 'the challenge is not x402Version 2')
  }
  if (!Array.isArray(b.accepts) || b.accepts.length === 0) {
    throw new X402ChallengeError('malformed_challenge', 'the challenge accepts nothing')
  }
  const resourceInfo =
    typeof b.resource === 'object' && b.resource !== null
      ? (b.resource as Record<string, unknown>)
      : undefined

  const accepts: X402Terms[] = []
  const skipped: string[] = []
  for (const [i, a] of b.accepts.entries()) {
    try {
      accepts.push(toTerms(a as Record<string, unknown>, `accepts[${i}]`, resourceInfo))
    } catch (err) {
      skipped.push((err as Error).message)
    }
  }
  if (accepts.length === 0) {
    // The skipped reasons are the whole diagnosis — without them this says only
    // "no", and an agent cannot tell an unsupported chain from a broken gateway.
    throw new X402ChallengeError(
      'no_payable_terms',
      `the gateway accepts ${b.accepts.length} terms, none of which this client can pay: ${skipped.join('; ')}`,
    )
  }
  return { x402Version: 2, accepts }
}

/** Picks which accepted asset to pay in. Defaults to the gateway's first. */
export function selectTerms(
  challenge: X402Challenge,
  preferAsset?: `0x${string}`,
): X402Terms {
  if (!preferAsset) return challenge.accepts[0]
  const want = getAddress(preferAsset)
  const found = challenge.accepts.find((t) => t.asset === want)
  if (!found) {
    throw new X402ChallengeError(
      'asset_not_accepted',
      `the gateway accepts ${challenge.accepts.map((t) => t.asset).join(', ')}, not ${want}`,
    )
  }
  return found
}
