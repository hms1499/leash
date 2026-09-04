import { describe, it, expect } from 'vitest'
import { DEPLOY_GAS } from '../lib/chain.js'

/**
 * Measured against Celo mainnet on 2026-09-04, twice and independently:
 * `cast estimate --create` and viem's `estimateGas` both returned exactly
 * this for SpendPolicyAccount with a one-address constructor.
 */
const MEASURED = 797_607n

describe('DEPLOY_GAS', () => {
  it('covers what deploying SpendPolicyAccount actually costs', () => {
    expect(DEPLOY_GAS).toBeGreaterThan(MEASURED)
  })

  it('leaves headroom for a compiler or constructor change', () => {
    expect(DEPLOY_GAS).toBeGreaterThanOrEqual((MEASURED * 13n) / 10n)
  })

  it('does not reserve anywhere near the block gas limit', () => {
    // Celo's block gas limit is 30,000,000. Reserving near it is the 209x
    // over-reserve the SDK's GAS_LIMIT comment measured at 0.465 USDC.
    expect(DEPLOY_GAS).toBeLessThan(3_000_000n)
  })
})
