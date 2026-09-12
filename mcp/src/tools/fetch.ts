import { parseUnits } from 'viem'
import type { LeashConfig } from '../config.js'
import { human } from '../errors.js'
import { WITHOUT_NUMBERS } from './pay.js'

type FetchDeps = {
  config: LeashConfig
  quote(args: {
    url: string; method?: string; body?: string; preferAsset?: `0x${string}`
  }): Promise<{
    terms: { maxAmountRequired: bigint; asset: `0x${string}`; description: string }
    x402Version: number
  }>
  payForResource(args: {
    url: string; method?: string; body?: string; maxAmount: bigint
    preferAsset?: `0x${string}`
  }): Promise<{
    paid: bigint
    toppedUp: bigint
    topUpTx?: `0x${string}`
    result: { status: number; body: unknown; settlement?: { success: boolean; transaction?: string } }
  }>
}

/**
 * Buys a 402-gated HTTP resource with money drawn through the policy.
 *
 * `quote_only` exists because an unpaid request returns the price for free, and
 * an agent that has not been told the price should not be committing money.
 *
 * `preferAsset` is passed on every call. Without it `selectTerms` falls back to
 * the challenge's first entry, which lets the GATEWAY decide what this wallet
 * pays in — and `max_amount` below is parsed at six decimals regardless of what
 * that turns out to be. The contract fails closed on a token it has no policy
 * for, so nothing leaked; what leaked was the explanation, which blamed the
 * owner for not configuring a token the agent never asked to use.
 */
export async function fetchTool(
  { config, quote, payForResource }: FetchDeps,
  args: { url: string; method?: string; body?: string; max_amount: string; quote_only?: boolean },
): Promise<Record<string, unknown>> {
  let maxAmount: bigint
  try {
    maxAmount = parseUnits(args.max_amount, 6)
  } catch {
    return {
      error: 'invalid_amount',
      message: `"${args.max_amount}" is not a decimal amount`,
      suggestion: 'Pass a ceiling in whole token units, for example "0.05".',
    }
  }

  if (args.quote_only) {
    // Guarded, because asking the price is the step most likely to fail on a
    // URL the caller got slightly wrong — and until this catch existed those
    // failures escaped the tool entirely. index.ts then reported them as
    // `internal_error` with "Check the server logs and the LEASH_*
    // environment variables", which sent an agent to debug a configuration
    // that was correct. Found against the real gateway: a request with no
    // body answered 400, and `quote` threw `not_paywalled`.
    let q
    try {
      q = await quote({
        url: args.url, method: args.method, body: args.body,
        preferAsset: config.token,
      })
    } catch (err) {
      const e = err as { code?: string; message?: string; status?: number }
      return {
        error: e.code ?? 'quote_failed',
        message: e.message ?? 'the price could not be read',
        ...(e.status === undefined ? {} : { status: e.status }),
        suggestion:
          'Nothing was paid and nothing was sent. Either the URL is not x402-gated, or it needs a request body before it will quote a price, or it does not accept the token this wallet pays in. Check the URL and the body before calling again.',
      }
    }
    return {
      ok: true,
      price: human(q.terms.maxAmountRequired),
      price_atomic: q.terms.maxAmountRequired.toString(),
      asset: q.terms.asset,
      description: q.terms.description,
      within_max: q.terms.maxAmountRequired <= maxAmount,
      note: 'Nothing was paid. Call again without quote_only to buy.',
    }
  }

  try {
    const out = await payForResource({
      url: args.url, method: args.method, body: args.body, maxAmount,
      preferAsset: config.token,
    })
    return {
      ok: true,
      paid: human(out.paid),
      drawn_from_account: human(out.toppedUp),
      top_up_transaction: out.topUpTx,
      settlement_transaction: out.result.settlement?.transaction,
      status: out.result.status,
      body: out.result.body,
    }
  } catch (err) {
    const e = err as {
      code?: string; message?: string; mayHaveSettled?: boolean
      spent?: bigint; cap?: bigint; status?: number; body?: unknown
      topUpTx?: `0x${string}`; toppedUp?: bigint
    }
    const mayHaveSettled = e.mayHaveSettled === true
    // A draw that was already sent is money out of the account and allowance
    // off the day, even though the purchase never happened. Saying "nothing
    // moved" here would be false, and would send an agent straight back to a
    // cap it has already spent.
    const drew = e.topUpTx !== undefined
    const base: Record<string, unknown> = {
      error: e.code ?? 'x402_failed',
      message: e.message ?? 'the paid request failed',
      may_have_settled: mayHaveSettled,
      suggestion: mayHaveSettled
        // x402 has no refund and no idempotency key. A retry here is a second
        // payment, so the instruction has to be unambiguous, and it outranks
        // every other sentence below.
        ? 'DO NOT RETRY. The payment may already have settled. Call leash_status to check the balance, and inspect the resource before spending again.'
        : drew
          ? 'Nothing was paid and nothing was signed, so the resource was not bought. But the draw was already sent: that money has left the account and the daily allowance has been charged for it. Call leash_status before trying again — a second attempt draws a second time.'
          // The same sentences leash_pay gives, from the same table. "Fix the
          // request and try again" is wrong advice for a policy decision: there
          // is nothing in the request to fix, and the retry it invites is
          // refused identically. Measured on mainnet 2026-09-12, where a
          // disabled top-up reached an agent under exactly that line.
          : WITHOUT_NUMBERS[e.code ?? '']
            ?? 'This failed before any money moved. Fix the request and try again.',
    }
    if (e.topUpTx !== undefined) base.top_up_transaction = e.topUpTx
    if (typeof e.toppedUp === 'bigint') base.drawn_from_account = human(e.toppedUp)
    // The gateway's own words, so an agent reporting this to a person has
    // something better than a status code to relay.
    if (e.status !== undefined) base.status = e.status
    if (e.body !== undefined) base.gateway_response = e.body
    // `cap` means a different thing for each refusal, and nothing at all for
    // most of them: the daily cap for DailyCapExceeded, the per-transaction cap
    // for PerTxCapExceeded, and a placeholder zero everywhere else. Labelling
    // it daily_cap unconditionally — which this did until 2026-09-12 — reported
    // a 0.50 per-transaction cap as a 0.50 daily cap, and told an agent refused
    // by a switch that its daily cap was 0.000000. pay.ts was fixed for exactly
    // this on 2026-09-05 and its sibling here was not; CLAUDE.md's rule that
    // two implementations of one operation must not disagree is what this pair
    // of branches now satisfies.
    if (e.code === 'daily_cap_exceeded' && typeof e.spent === 'bigint' && typeof e.cap === 'bigint') {
      const remaining = e.cap > e.spent ? e.cap - e.spent : 0n
      base.spent_today = human(e.spent)
      base.daily_cap = human(e.cap)
      base.remaining_today = human(remaining)
    } else if (e.code === 'per_tx_cap_exceeded' && typeof e.cap === 'bigint') {
      base.per_tx_cap = human(e.cap)
    }
    return base
  }
}
