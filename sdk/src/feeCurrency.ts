import { KNOWN_FEE_ADAPTERS } from './constants.js'

export class NoFundedFeeAdapterError extends Error {
  constructor() {
    super(
      'No whitelisted fee-currency adapter has a balance. The operator wallet ' +
        'holds no CELO by design, so it cannot pay gas until one is funded.',
    )
    this.name = 'NoFundedFeeAdapterError'
  }
}

/**
 * Chooses which stablecoin pays for gas. Only adapters on the on-chain
 * whitelist are eligible — a balance in some other token is not spendable
 * as gas and is ignored.
 */
export function pickFeeAdapter(
  balances: ReadonlyMap<`0x${string}`, bigint>,
  adapters: readonly `0x${string}`[] = KNOWN_FEE_ADAPTERS,
): `0x${string}` {
  let best: `0x${string}` | undefined
  let bestBalance = 0n

  for (const adapter of adapters) {
    const balance = balances.get(adapter) ?? 0n
    if (balance > bestBalance) {
      best = adapter
      bestBalance = balance
    }
  }

  if (!best) throw new NoFundedFeeAdapterError()
  return best
}
