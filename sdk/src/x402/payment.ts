import { getAddress, type Account } from 'viem'
import { celo } from 'viem/chains'
import type { X402Terms } from './challenge.js'

export type X402Authorization = {
  from: `0x${string}`
  to: `0x${string}`
  value: bigint
  validAfter: bigint
  validBefore: bigint
  nonce: `0x${string}`
}

/** EIP-3009. The field order is part of the type hash and must not change. */
const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const

/** Seconds of backdating on validAfter, to absorb clock skew against the facilitator. */
const CLOCK_SKEW_SECONDS = 60

export function buildAuthorization(args: {
  from: `0x${string}`
  terms: X402Terms
  /** Unix seconds. Injectable so tests are not time-dependent. */
  now?: number
  /** Injectable for tests only. Production draws from the CSPRNG. */
  nonce?: `0x${string}`
}): X402Authorization {
  const now = args.now ?? Math.floor(Date.now() / 1000)
  const nonce =
    args.nonce ??
    (`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}` as `0x${string}`)

  return {
    from: getAddress(args.from),
    to: getAddress(args.terms.payTo),
    value: args.terms.maxAmountRequired,
    validAfter: BigInt(now - CLOCK_SKEW_SECONDS),
    validBefore: BigInt(now + args.terms.maxTimeoutSeconds),
    nonce,
  }
}

/**
 * Signs the authorization and returns the base64 `X-PAYMENT` header value.
 *
 * The domain comes from the challenge's `extra`, not from a table of known
 * tokens: it is the only place the gateway publishes what the token will
 * actually verify against, and guessing it produces a signature that fails at
 * settlement rather than at signing.
 */
export async function signPayment(args: {
  account: Account
  terms: X402Terms
  authorization: X402Authorization
  x402Version: number
}): Promise<string> {
  const { account, terms, authorization, x402Version } = args
  if (!account.signTypedData) {
    throw new Error('account cannot signTypedData')
  }

  const signature = await account.signTypedData({
    domain: {
      name: terms.tokenName,
      version: terms.tokenVersion,
      chainId: celo.id,
      verifyingContract: terms.asset,
    },
    types: AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })

  const payment = {
    x402Version,
    scheme: terms.scheme,
    network: terms.network,
    payload: {
      signature,
      authorization: Object.fromEntries(
        Object.entries(authorization).map(([k, v]) => [
          k,
          typeof v === 'bigint' ? v.toString() : v,
        ]),
      ),
    },
  }
  return Buffer.from(JSON.stringify(payment)).toString('base64')
}
