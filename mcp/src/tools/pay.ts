import { isAddress, getAddress, parseUnits } from 'viem'
import type { LeashConfig } from '../config.js'
import { human } from '../errors.js'

type PreCheckFailure = { ok: false; error: string; spent: bigint; cap: bigint }

type PayDeps = {
  leash: {
    preCheck(token: `0x${string}`, to: `0x${string}`, amount: bigint): Promise<
      { ok: true } | PreCheckFailure
    >
    spend(
      token: `0x${string}`, to: `0x${string}`, amount: bigint,
      feeBalances: ReadonlyMap<`0x${string}`, bigint>,
    ): Promise<`0x${string}`>
    remainingToday(token: `0x${string}`): Promise<bigint>
  }
  config: LeashConfig
  feeBalances: ReadonlyMap<`0x${string}`, bigint>
}

/**
 * What to tell an agent about a refusal that carries no numbers.
 *
 * These reverts say nothing about caps, and the daily reset does not clear
 * any of them. An agent told to "wait for the reset at UTC midnight" after
 * the owner pressed Stop will sleep and retry against a switch a human threw
 * on purpose — so each of these says plainly that waiting is not the answer,
 * and names who can actually clear it.
 */
const WITHOUT_NUMBERS: Record<string, string> = {
  account_paused:
    'The owner has paused the account. Nothing will succeed until they resume it — the daily reset does not clear a pause.',
  not_an_operator:
    'This wallet is not an authorised operator on the account. Only the owner can restore it, with setOperator; the daily reset does not clear this.',
  payee_not_allowed:
    'The payee allowlist is on and this address is not on it. Pay an address that is already allowed, or ask the owner to add this one; the daily reset does not clear this.',
  token_not_configured:
    'The account has no policy for this token — or the owner deliberately froze it by setting its daily cap to 0, which the contract cannot tell apart. Ask the owner rather than assuming it merely needs configuring.',
  transfer_failed:
    'The policy allowed this payment and the token transfer itself failed, which usually means the account does not hold enough. Call leash_status to see the balance.',
}

/**
 * Turns a refusal into numbers an agent can act on — and never into numbers
 * the refusal did not actually carry.
 *
 * `PreCheckResult` has one `cap` field whose meaning changes with the error:
 * the daily cap for DailyCapExceeded, the per-transaction cap for
 * PerTxCapExceeded, and zero for everything else. Labelling it `daily_cap`
 * unconditionally, as this did until 2026-09-05, reported a 0.50 per-transaction
 * cap as a 0.50 daily cap on an account whose daily cap was 1.00, and reported
 * a paused account as one with 0.00 of allowance left. Only one of the five
 * refusal shapes came back correct.
 */
async function refusal(
  { leash, config }: Pick<PayDeps, 'leash' | 'config'>,
  amount: bigint,
  to: `0x${string}`,
  check: PreCheckFailure,
): Promise<Record<string, unknown>> {
  const base = {
    error: check.error,
    message: `the on-chain policy refused a payment of ${human(amount)}`,
    requested: human(amount),
  }

  if (check.error === 'daily_cap_exceeded') {
    // DailyCapExceeded(spentToday, amount, cap) carries both figures, so this
    // needs no read: the numbers came from the same call that refused.
    const remaining = check.cap > check.spent ? check.cap - check.spent : 0n
    return {
      ...base,
      spent_today: human(check.spent),
      daily_cap: human(check.cap),
      remaining_today: human(remaining),
      suggestion: remaining > 0n
        ? `Retry with ${human(remaining)} or less, or wait for the daily allowance to reset at UTC midnight.`
        : 'Today\'s allowance is spent. Wait for the reset at UTC midnight, or ask the owner to raise the daily cap.',
    }
  }

  if (check.error === 'per_tx_cap_exceeded') {
    // PerTxCapExceeded(amount, cap) carries the per-transaction cap and
    // nothing about the day, so the daily figure is read from the chain
    // rather than derived. It cannot be computed from limits() either: that
    // returns spentToday raw, and the contract ignores it once its `day`
    // label is stale. remainingToday() is the view that applies the rollover.
    let remainingToday: bigint | null = null
    try {
      remainingToday = await leash.remainingToday(config.token)
    } catch {
      // One node refusing a read must not turn a precise refusal into a
      // wrong one. The field is omitted below rather than guessed.
    }
    // The real ceiling on a next attempt is whichever bound bites first.
    const ceiling = remainingToday === null || check.cap < remainingToday
      ? check.cap
      : remainingToday
    return {
      ...base,
      per_tx_cap: human(check.cap),
      ...(remainingToday === null ? {} : { remaining_today: human(remainingToday) }),
      suggestion: ceiling > 0n
        ? `Retry with ${human(ceiling)} or less; a larger total must be split across several payments.${
            remainingToday === null
              ? ' The daily allowance could not be read — call leash_status before planning more.'
              : ''
          }`
        : 'Today\'s allowance is spent. Wait for the reset at UTC midnight, or ask the owner to raise the caps.',
    }
  }

  return {
    ...base,
    ...(check.error === 'payee_not_allowed' ? { payee: to } : {}),
    suggestion: WITHOUT_NUMBERS[check.error]
      ?? 'The account refused this payment for a reason that could not be decoded. Call leash_status, and check the account on a block explorer before retrying.',
  }
}

/**
 * Pays a payee on-chain through Path A, where all three checks apply.
 *
 * The refusal path is the one that matters. `preCheck` is a `staticcall`, so a
 * blocked payment costs no gas, and what comes back has to be something an
 * agent can reason with: one told only "denied" retries the same amount, and
 * one told the wrong reason retries the wrong fix.
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
  if (!check.ok) return refusal({ leash, config }, amount, to, check)

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
