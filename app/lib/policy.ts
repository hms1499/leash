import { formatUnits, parseUnits } from 'viem'

/**
 * What the agent has spent today.
 *
 * Derived rather than read: the contract's `limits().spentToday` is only
 * reset inside `_consume()`, so it is stale after a UTC day rolls over until
 * the next spend. `remainingToday()` does the day comparison itself, which
 * makes this subtraction correct at every moment.
 */
export function spentToday(daily: bigint, remaining: bigint): bigint {
  return remaining >= daily ? 0n : daily - remaining
}

export function percentUsed(daily: bigint, remaining: bigint): number {
  if (daily === 0n) return 0
  const used = spentToday(daily, remaining)
  return Number((used * 10_000n) / daily) / 100
}

/**
 * The largest amount that would still be accepted right now — the tighter of
 * the two caps. This is what the meter states before money moves, since a
 * refusal is a staticcall and never becomes a transaction to show afterwards.
 */
export function refusalThreshold(remaining: bigint, perTx: bigint): bigint {
  return remaining < perTx ? remaining : perTx
}

export function formatAmount(value: bigint, decimals: number, places = decimals): string {
  const full = formatUnits(value, decimals)
  const [whole, fraction = ''] = full.split('.')
  return places === 0 ? whole : `${whole}.${fraction.padEnd(places, '0').slice(0, places)}`
}

export function parseAmount(input: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(input.trim())) {
    throw new RangeError(`"${input}" is not a positive decimal amount`)
  }
  const [, fraction = ''] = input.trim().split('.')
  if (fraction.length > decimals) {
    throw new RangeError(`more than ${decimals} decimal places would be truncated`)
  }
  return parseUnits(input.trim(), decimals)
}

/**
 * Whether the connected wallet may write to this account.
 *
 * This is a display gate, not a security boundary — the contract's onlyOwner
 * modifier is the security boundary. It exists so a non-owner is not offered
 * a button whose transaction would certainly revert.
 */
export function canEdit(
  owner: string | null | undefined,
  connected: string | null | undefined,
): boolean {
  if (!owner || !connected) return false
  return owner.toLowerCase() === connected.toLowerCase()
}

export type LimitsValidation =
  | { ok: true; perTx: bigint; daily: bigint }
  | { ok: false; error: string }

/**
 * Validates a limits edit before it becomes a transaction.
 *
 * Shared by the onboarding wizard and the dashboard drawer so one operation
 * does not have two sets of rules. Three of these checks exist because the
 * chain punishes the mistake rather than rejecting it:
 *
 * - `daily == 0` is the contract's TokenNotConfigured sentinel
 *   (SpendPolicyAccount.sol:85). It does not mean "no daily limit"; it makes
 *   every operator path revert. An owner who wants to halt spending uses the
 *   Stop button, which is reversible and says what it did.
 * - `perTx == 0` refuses every non-zero spend (`amount > l.perTx`), the same
 *   dead end by another route.
 * - A no-op save would satisfy the caller's confirmation poll on its first
 *   iteration, so the UI would report a landed transaction that was never
 *   sent. Refusing it keeps "confirmed" meaning observed.
 */
export function validateLimits(
  perTxInput: string,
  dailyInput: string,
  decimals: number,
  current?: { perTx: bigint; daily: bigint },
): LimitsValidation {
  let perTx: bigint
  let daily: bigint
  try {
    perTx = parseAmount(perTxInput, decimals)
    daily = parseAmount(dailyInput, decimals)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  if (daily === 0n) {
    return {
      ok: false,
      error: 'A daily cap of 0 does not remove the limit — it disables the account, and every spend would be refused until you set one again. Use Stop to halt the agent instead.',
    }
  }
  if (perTx === 0n) {
    return {
      ok: false,
      error: 'A per-transaction cap of 0 would refuse every spend. Use Stop to halt the agent instead.',
    }
  }
  if (perTx > daily) {
    return { ok: false, error: 'The per-transaction cap cannot exceed the daily cap.' }
  }
  if (current && perTx === current.perTx && daily === current.daily) {
    return { ok: false, error: 'Those are already the limits on chain — nothing to save.' }
  }

  return { ok: true, perTx, daily }
}
