import type { Account } from 'viem'
import type { LeashClient } from '../policyClient.js'
import { pollUntil } from '../confirm.js'
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
 * Extra drawn on top of the shortfall, in the payment token's atomic units.
 *
 * This carries two costs, not one, which is why it is larger than a single
 * transaction's gas:
 *
 * 1. **The draw's own gas.** The draw is a transaction the operator sends, and
 *    on Celo it pays its gas in the same stablecoin it is drawing. Drawing
 *    exactly `price - held` lands the operator on `price` and then spends the
 *    gas out of that, leaving it short of the amount it already signed an
 *    authorization for; the settlement then fails for insufficient balance.
 *
 * 2. **A float, so the wallet still works afterwards.** Whatever this buffer
 *    does not spend on gas is all the operator has left once the settlement
 *    takes `price`. A node reserves `gasLimit * maxFeePerGas` up front, roughly
 *    3x the real cost, so an operator left below about 6700 cannot send
 *    anything at all — including the very draw that would refill it. It strands
 *    until the owner rescues it.
 *
 * T0.1 measured a tagged send at ~2228 atomic units, so 15000 covers the gas
 * and leaves ~12772: a few more transactions of headroom, for $0.015.
 */
const DEFAULT_GAS_BUFFER = 15_000n

/**
 * The balance below which the operator can no longer send anything.
 *
 * A node reserves `gasLimit * maxFeePerGas` before it will simulate, roughly
 * 3x what the transaction actually costs, so a wallet under this cannot send
 * a transaction at all — including the `topUpOperator` that would refill it.
 * It strands until the owner sweeps to it.
 *
 * This is why affording the price is not the same as being able to pay it:
 * an operator holding EXACTLY the price buys the resource and is then bricked,
 * because the settlement takes every unit it had. The draw below is therefore
 * triggered by what survives the purchase, not by what covers it.
 */
const MIN_OPERATOR_FLOAT = 6_700n

/**
 * Buys a 402-gated resource with money drawn through the on-chain policy.
 *
 * The order matters and is the product:
 *
 *   1. quote  — free, so a price the caller will not accept costs nothing
 *   2. cap    — the caller's own ceiling, checked before any money moves
 *   3. draw   — `topUpOperator`, where the contract's per-tx and daily caps
 *               decide how much may leave the account today
 *   4. wait   — until the drawn money is actually there, before signing
 *   5. pay    — the operator signs for itself, once
 *
 * Steps 2 and 3 are what separate this from any other x402 client: an agent
 * cannot talk its way past step 3, because it is a `revert`.
 *
 * What step 3 bounds is what LEAVES THE CONTRACT, not what the operator can
 * spend. Funds already sitting in the operator's own wallet are outside the
 * policy's reach by construction — the same reason the payee allowlist cannot
 * apply to Path B — so a purchase the operator can already afford proceeds
 * without a draw, and always has. The guarantee being made is the daily cap on
 * withdrawals, and that one holds.
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
  /** Overrides `DEFAULT_GAS_BUFFER`. Only applies when a draw actually happens. */
  gasBuffer?: bigint
  /** How long to wait for a draw to land. Only applies when one happens. */
  drawWait?: { attempts?: number; intervalMs?: number }
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

  // The buffer is deliberately inside the draw, so it is consumed against the
  // daily cap like any other spend: gas is a real cost of this payment, and
  // hiding it from the policy would let an agent spend past its cap in gas.
  // A caller-supplied buffer smaller than the float can make this zero or
  // negative, in which case there is nothing worth drawing.
  const want = held < price + MIN_OPERATOR_FLOAT
    ? price - held + (args.gasBuffer ?? DEFAULT_GAS_BUFFER)
    : 0n

  if (want > 0n) {
    const check = await args.leash.preCheckTopUp(q.terms.asset, want)

    // Refused, and the wallet cannot cover the price on its own: the refusal
    // is the answer, and it must surface as itself rather than as a failed
    // transaction.
    if (!check.ok && held < price) {
      const e = new X402PaymentError(
        check.error,
        `the on-chain policy refused a draw of ${want}`,
        { mayHaveSettled: false },
      )
      throw Object.assign(e, { spent: check.spent, cap: check.cap })
    }

    // Refused, but the wallet can already afford the price: buy it. The float
    // is a nicety and the purchase is the job — declining a payment the policy
    // permits, because the policy will not ALSO fund a cushion, blocks real
    // work over an inconvenience the owner can undo with sweep.
    if (check.ok) {
      toppedUp = want
      topUpTx = await args.leash.topUp(q.terms.asset, toppedUp, args.feeBalances)

      // A hash is not money. `topUp` resolves when a node accepts the draw,
      // and the operator's balance rises a second or two later — so signing
      // here produced an EIP-3009 authorization for a price the wallet did not
      // yet hold. The facilitator then failed to settle it and the agent saw
      // the GATEWAY refuse, with the draw's allowance already spent and
      // nothing bought.
      //
      // Waited on the condition rather than on the draw's receipt,
      // deliberately: what the settlement depends on is the balance, and forno
      // is load-balanced, so a receipt proves the draw landed but never that
      // the node the facilitator asks has seen that block.
      const funded = await pollUntil(
        async () => (await args.leash.operatorBalance(q.terms.asset)) >= price,
        { attempts: 30, intervalMs: 2000, ...args.drawWait },
      )
      if (!funded) {
        // Nothing has been signed yet, so `mayHaveSettled: false` is a fact
        // rather than a guess — this is the last moment at which that is true,
        // which is exactly why the check belongs here and not one step later.
        const e = new X402PaymentError(
          'draw_unconfirmed',
          `drew ${toppedUp} from the account but the operator balance has not reached ${price}; nothing was signed and nothing was paid`,
          { mayHaveSettled: false },
        )
        throw Object.assign(e, { topUpTx, toppedUp })
      }
    }
  }

  const result = await payAndFetch({
    url: args.url, method: args.method, body: args.body,
    account: args.account, quote: q, fetchImpl: args.fetchImpl,
  })

  return { paid: price, toppedUp, topUpTx, result }
}
