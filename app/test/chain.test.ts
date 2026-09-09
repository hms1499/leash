import { describe, it, expect } from 'vitest'
import { DEPLOY_GAS, publicClient } from '../lib/chain.js'

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

/**
 * The dashboard was unusable on a free public RPC before this: every load
 * logged `POST https://rpc.ankr.com/celo 429 (Too Many Requests)`.
 *
 * useAccountState issues six reads in one Promise.all every four seconds, and
 * /accounts verifies five candidates x three reads at a time. Unbatched, that
 * is one HTTP request each. Measured against forno on 2026-09-09 with the six
 * reads useAccountState actually makes: 6 POSTs without `batch.multicall`, 1
 * with it, and byte-identical results.
 *
 * Asserted here because the failure is silent — dropping the option costs no
 * test and no type error, it just quietly restores the 429s.
 */
describe('publicClient', () => {
  it('aggregates concurrent eth_calls into one request', () => {
    expect(publicClient.batch?.multicall).toBeTruthy()
  })

  it('has a Multicall3 address to aggregate through', () => {
    // viem falls back to a deployless call without this, which would send the
    // Multicall3 bytecode on every batch instead of calling the deployment.
    expect(publicClient.chain.contracts?.multicall3?.address).toBe(
      '0xcA11bde05977b3631167028862bE2a173976CA11',
    )
  })
})
