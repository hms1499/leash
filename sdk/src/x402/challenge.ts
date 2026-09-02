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

const SUPPORTED_NETWORK = 'celo'
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

  const accepts = b.accepts.map((a: Record<string, unknown>, i): X402Terms => {
    const where = `accepts[${i}]`
    if (a.scheme !== SUPPORTED_SCHEME) {
      throw new X402ChallengeError(
        'unsupported_scheme',
        `${where} uses scheme "${String(a.scheme)}"; this client implements "${SUPPORTED_SCHEME}" only`,
      )
    }
    if (a.network !== SUPPORTED_NETWORK) {
      throw new X402ChallengeError(
        'unsupported_network',
        `${where} is on network "${String(a.network)}"; this client signs for "${SUPPORTED_NETWORK}" only`,
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
    if (typeof a.maxAmountRequired !== 'string') {
      throw new X402ChallengeError('malformed_challenge', `${where}.maxAmountRequired is not a string`)
    }
    return {
      scheme: a.scheme,
      network: a.network,
      maxAmountRequired: BigInt(a.maxAmountRequired),
      resource: String(a.resource ?? ''),
      payTo: getAddress(a.payTo),
      asset: getAddress(a.asset),
      maxTimeoutSeconds: typeof a.maxTimeoutSeconds === 'number' ? a.maxTimeoutSeconds : 300,
      tokenName: extra.name,
      tokenVersion: extra.version,
      description: String(a.description ?? ''),
    }
  })

  return { x402Version: b.x402Version, accepts }
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
