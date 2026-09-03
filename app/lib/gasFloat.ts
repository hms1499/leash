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
