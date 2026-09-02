import { parseUnits } from 'viem'
import type { LeashConfig } from '../config.js'
import { human } from '../errors.js'

type FetchDeps = {
  config: LeashConfig
  quote(args: { url: string; method?: string; body?: string }): Promise<{
    terms: { maxAmountRequired: bigint; asset: `0x${string}`; description: string }
    x402Version: number
  }>
  payForResource(args: {
    url: string; method?: string; body?: string; maxAmount: bigint
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
    const q = await quote({ url: args.url, method: args.method, body: args.body })
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
    }
    const mayHaveSettled = e.mayHaveSettled === true
    const base: Record<string, unknown> = {
      error: e.code ?? 'x402_failed',
      message: e.message ?? 'the paid request failed',
      may_have_settled: mayHaveSettled,
      suggestion: mayHaveSettled
        // x402 has no refund and no idempotency key. A retry here is a second
        // payment, so the instruction has to be unambiguous.
        ? 'DO NOT RETRY. The payment may already have settled. Call leash_status to check the balance, and inspect the resource before spending again.'
        : 'This failed before any money moved. Fix the request and try again.',
    }
    // The gateway's own words, so an agent reporting this to a person has
    // something better than a status code to relay.
    if (e.status !== undefined) base.status = e.status
    if (e.body !== undefined) base.gateway_response = e.body
    if (typeof e.spent === 'bigint' && typeof e.cap === 'bigint') {
      const remaining = e.cap > e.spent ? e.cap - e.spent : 0n
      base.spent_today = human(e.spent)
      base.daily_cap = human(e.cap)
      base.remaining_today = human(remaining)
    }
    return base
  }
}
