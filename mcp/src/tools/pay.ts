import { isAddress, getAddress, parseUnits } from 'viem'
import type { LeashConfig } from '../config.js'
import { human } from '../errors.js'

type PayDeps = {
  leash: {
    preCheck(token: `0x${string}`, to: `0x${string}`, amount: bigint): Promise<
      { ok: true } | { ok: false; error: string; spent: bigint; cap: bigint }
    >
    spend(
      token: `0x${string}`, to: `0x${string}`, amount: bigint,
      feeBalances: ReadonlyMap<`0x${string}`, bigint>,
    ): Promise<`0x${string}`>
  }
  config: LeashConfig
  feeBalances: ReadonlyMap<`0x${string}`, bigint>
}

/**
 * Pays a payee on-chain through Path A, where all three checks apply.
 *
 * The refusal path is the one that matters. `preCheck` is a `staticcall`, so a
 * blocked payment costs no gas, and the numbers it returns are put into the
 * response verbatim: an agent told only "denied" retries the same amount, while
 * one told it has 0.10 left asks for 0.10.
 */
export async function payTool(
  { leash, config, feeBalances }: PayDeps,
  args: { to: string; amount: string },
): Promise<Record<string, unknown>> {
  if (!isAddress(args.to)) {
    return {
      error: 'invalid_payee',
      message: `"${args.to}" is not a Celo address`,
      suggestion: 'Pass a 0x-prefixed 20-byte address.',
    }
  }

  let amount: bigint
  try {
    amount = parseUnits(args.amount, 6)
  } catch {
    return {
      error: 'invalid_amount',
      message: `"${args.amount}" is not a decimal amount`,
      suggestion: 'Pass a decimal string in whole token units, for example "0.25".',
    }
  }
  if (amount <= 0n) {
    return { error: 'invalid_amount', message: 'amount must be positive', suggestion: 'Pass a positive amount.' }
  }

  const to = getAddress(args.to)
  const check = await leash.preCheck(config.token, to, amount)
  if (!check.ok) {
    const remaining = check.cap > check.spent ? check.cap - check.spent : 0n
    return {
      error: check.error,
      message: `the on-chain policy refused a payment of ${human(amount)}`,
      requested: human(amount),
      spent_today: human(check.spent),
      daily_cap: human(check.cap),
      remaining_today: human(remaining),
      suggestion:
        remaining > 0n
          ? `Retry with ${human(remaining)} or less, or wait for the daily allowance to reset at UTC midnight.`
          : 'The allowance is exhausted. Wait for the reset at UTC midnight, or ask the owner to raise the cap.',
    }
  }

  const transaction = await leash.spend(config.token, to, amount, feeBalances)
  return {
    ok: true,
    transaction,
    explorer: `https://celoscan.io/tx/${transaction}`,
    paid: human(amount),
    to,
    token: config.token,
  }
}
