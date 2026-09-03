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
