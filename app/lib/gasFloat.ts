/**
 * Measured on Celo mainnet 2026-09-02, in USDC atomic units (6 decimals).
 *
 * The reserve is not the price. A node holds RESERVE against the balance
 * before it will simulate a fee-currency transaction, so a wallet holding
 * less than that cannot transact at all even though a transaction costs less.
 */
const COST_PER_TX = 2_800n
const RESERVE = 4_600n

/**
 * How many more transactions the agent can send before it stalls.
 *
 * This is the number that matters: when it reaches zero the agent stops, and
 * it cannot draw more from the account because drawing costs gas.
 */
export function transactionsLeft(float: bigint): number {
  if (float < RESERVE) return 0
  return Number((float - RESERVE) / COST_PER_TX) + 1
}

/**
 * What a refuel should actually send, given what the account holds.
 *
 * Sweeping a fixed amount the account cannot cover reverts, and the revert is
 * indistinguishable from a slow chain: the destination balance never rises, so
 * the poll times out and the owner is told "Sent, but the chain has not
 * confirmed it yet. Reload in a moment." They reload forever -- at exactly the
 * moment the button exists for, because "the protected account is nearly
 * empty" is a normal end state for a working account, not an exotic one.
 *
 * Below RESERVE a node will not simulate a fee-currency transaction at all, so
 * sending the last few units buys the agent nothing and still costs the owner
 * gas. Say so instead of pretending it helped.
 */
export function planRefuel(
  protectedBalance: bigint, requested: bigint,
): { ok: true; amount: bigint } | { ok: false; reason: 'empty' | 'below-reserve' } {
  if (protectedBalance === 0n) return { ok: false, reason: 'empty' }
  if (protectedBalance < RESERVE) return { ok: false, reason: 'below-reserve' }
  return { ok: true, amount: protectedBalance < requested ? protectedBalance : requested }
}
