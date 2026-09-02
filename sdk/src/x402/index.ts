import type { Account } from 'viem'
import type { LeashClient } from '../policyClient.js'
import { quote, payAndFetch, X402PaymentError, type X402Result } from './fetch.js'

export * from './challenge.js'
export * from './payment.js'
export * from './fetch.js'

export type PayForResourceResult = {
  /** What the gateway charged, in the payment token's atomic units. */
  paid: bigint
  /** What had to be drawn from the contract to afford it. Zero if nothing was. */
  toppedUp: bigint
  topUpTx?: `0x${string}`
  result: X402Result
}

/**
 * Buys a 402-gated resource with money drawn through the on-chain policy.
 *
 * The order matters and is the product:
 *
 *   1. quote  — free, so a price the caller will not accept costs nothing
 *   2. cap    — the caller's own ceiling, checked before any money moves
 *   3. draw   — `topUpOperator`, where the contract's per-tx and daily caps
 *               decide whether this payment is allowed to happen at all
 *   4. pay    — the operator signs for itself, once
 *
 * Steps 2 and 3 are what separate this from any other x402 client: an agent
 * cannot talk its way past step 3, because it is a `revert`.
 */
export async function payForResource(args: {
  leash: LeashClient
  account: Account
  url: string
  method?: string
  body?: string
  preferAsset?: `0x${string}`
  feeBalances: ReadonlyMap<`0x${string}`, bigint>
  /** The caller's ceiling in atomic units. A quote above this is refused. */
  maxAmount: bigint
  fetchImpl?: typeof fetch
}): Promise<PayForResourceResult> {
  const q = await quote({
    url: args.url, method: args.method, body: args.body,
    preferAsset: args.preferAsset, fetchImpl: args.fetchImpl,
  })
  const price = q.terms.maxAmountRequired

  if (price > args.maxAmount) {
    throw new X402PaymentError(
      'price_above_max',
      `the gateway quoted ${price} but the caller allowed at most ${args.maxAmount}`,
      { mayHaveSettled: false },
    )
  }

  const held = await args.leash.operatorBalance(q.terms.asset)
  let toppedUp = 0n
  let topUpTx: `0x${string}` | undefined

  if (held < price) {
    toppedUp = price - held
    const check = await args.leash.preCheckTopUp(q.terms.asset, toppedUp)
    if (!check.ok) {
      const e = new X402PaymentError(
        check.error,
        `the on-chain policy refused a draw of ${toppedUp}`,
        { mayHaveSettled: false },
      )
      throw Object.assign(e, { spent: check.spent, cap: check.cap })
    }
    topUpTx = await args.leash.topUp(q.terms.asset, toppedUp, args.feeBalances)
  }

  const result = await payAndFetch({
    url: args.url, method: args.method, body: args.body,
    account: args.account, quote: q, fetchImpl: args.fetchImpl,
  })

  return { paid: price, toppedUp, topUpTx, result }
}
