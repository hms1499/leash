import type { Account } from 'viem'
import { parseChallenge, parseChallengeV2, selectTerms, type X402Terms } from './challenge.js'
import { buildAuthorization, signPayment } from './payment.js'
import { X402ChallengeError } from './challenge.js'

/**
 * The wire names, per version.
 *
 * v2 did not extend v1's headers, it replaced them: `X-PAYMENT` became
 * `PAYMENT-SIGNATURE` and `X-PAYMENT-RESPONSE` became `PAYMENT-RESPONSE`.
 * Sending the wrong pair is not a soft failure — the gateway sees no payment
 * at all and answers 402 again, after the authorization has been signed.
 */
const HEADERS = {
  v1: { payment: 'X-PAYMENT', settlement: 'x-payment-response' },
  v2: { challenge: 'PAYMENT-REQUIRED', payment: 'PAYMENT-SIGNATURE', settlement: 'PAYMENT-RESPONSE' },
} as const

/** Decodes a base64 header, blaming the header rather than leaking a SyntaxError. */
function decodeHeader(value: string, name: string): unknown {
  try {
    return JSON.parse(Buffer.from(value, 'base64').toString())
  } catch {
    throw new X402ChallengeError('malformed_challenge', `the ${name} header is not base64 JSON`)
  }
}

export type X402Quote = { terms: X402Terms; x402Version: number }

export type X402Settlement = {
  success: boolean
  transaction?: `0x${string}`
  payer?: `0x${string}`
  network?: string
}

export type X402Result = { status: number; body: unknown; settlement?: X402Settlement }

export class X402PaymentError extends Error {
  readonly code: string
  /**
   * True when the failure happened after the payment was handed over, so the
   * money may already be gone. x402 has no refund primitive and no idempotency
   * key: a caller that retries on this is paying twice.
   */
  readonly mayHaveSettled: boolean
  readonly status?: number
  /**
   * Whatever the gateway said. Kept because a 5xx is the one failure that
   * cannot be retried, so the response body is the only evidence available for
   * deciding whether the fault was ours — discarding it leaves a caller with a
   * status code and nothing to act on.
   */
  readonly body?: unknown
  constructor(
    code: string, message: string,
    opts: { mayHaveSettled: boolean; status?: number; body?: unknown },
  ) {
    super(message)
    this.name = 'X402PaymentError'
    this.code = code
    this.mayHaveSettled = opts.mayHaveSettled
    this.status = opts.status
    this.body = opts.body
  }
}

/** Asks the price. Unpaid, so it costs nothing and spends no settlement. */
export async function quote(args: {
  url: string
  method?: string
  body?: string
  preferAsset?: `0x${string}`
  fetchImpl?: typeof fetch
}): Promise<X402Quote> {
  const f = args.fetchImpl ?? fetch
  const res = await f(args.url, {
    method: args.method ?? 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: args.body,
  })
  if (res.status !== 402) {
    throw new X402PaymentError(
      'not_paywalled',
      `expected 402 from ${args.url}, got ${res.status}`,
      { mayHaveSettled: false, status: res.status },
    )
  }
  // v2 moved the challenge out of the body and into a header, leaving the body
  // `{}`. Reading the body first therefore reports every v2 gateway as
  // `malformed_challenge` — which is exactly what agent402.tools did.
  const encoded = res.headers.get(HEADERS.v2.challenge)
  const challenge = encoded
    ? parseChallengeV2(decodeHeader(encoded, HEADERS.v2.challenge))
    : parseChallenge(await res.json())
  return { terms: selectTerms(challenge, args.preferAsset), x402Version: challenge.x402Version }
}

/**
 * Pays and retries the request. Exactly once.
 *
 * There is deliberately no retry loop in here. The caller cannot distinguish a
 * gateway that failed before settling from one that failed after, so a retry is
 * a coin flip with real money on it.
 */
export async function payAndFetch(args: {
  url: string
  method?: string
  body?: string
  account: Account
  quote: X402Quote
  fetchImpl?: typeof fetch
}): Promise<X402Result> {
  const f = args.fetchImpl ?? fetch
  const authorization = buildAuthorization({ from: args.account.address, terms: args.quote.terms })
  const header = await signPayment({
    account: args.account,
    terms: args.quote.terms,
    authorization,
    x402Version: args.quote.x402Version,
  })

  const wire = args.quote.x402Version >= 2 ? HEADERS.v2 : HEADERS.v1

  const res = await f(args.url, {
    method: args.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', [wire.payment]: header },
    body: args.body,
  })

  let settlement: X402Settlement | undefined
  const encoded = res.headers.get(wire.settlement)
  if (encoded) {
    try {
      settlement = JSON.parse(Buffer.from(encoded, 'base64').toString())
    } catch {
      settlement = undefined
    }
  }

  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    /* a non-JSON body is still worth returning verbatim */
  }

  if (res.status >= 500) {
    throw new X402PaymentError(
      'gateway_error',
      `the gateway returned ${res.status} after the payment was sent; it may already have settled`,
      { mayHaveSettled: true, status: res.status, body },
    )
  }
  if (res.status >= 400) {
    throw new X402PaymentError(
      'payment_refused',
      `the gateway refused the request with ${res.status}`,
      { mayHaveSettled: false, status: res.status, body },
    )
  }

  return { status: res.status, body, settlement }
}
