import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
 * useAccountState issues its reads in one Promise.all every four seconds
 * (six when this was measured, eight since v2 added pendingOwner and
 * topUpEnabled), and /accounts verifies five candidates x three reads at a
 * time. Unbatched, that is one HTTP request each. Measured against forno on
 * 2026-09-09 with the six reads useAccountState made then: 6 POSTs without
 * `batch.multicall`, 1 with it, and byte-identical results.
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

/**
 * SpendPolicyAccount is not upgradeable, so every v1 account ever deployed
 * stays v1 — including this project's own test account. Neither
 * `pendingOwner()` nor `topUpEnabled()` exists on one, and both revert.
 *
 * Inside the dashboard's Promise.all that took every other figure down with
 * them: balance, limits and remaining allowance all rendered "—" on an account
 * that was working perfectly. Measured against 0xA73DB76f…F83982 on forno,
 * 2026-09-12, where the two reads revert and `owner()` answers normally.
 *
 * Asserted against the source because the hook needs a React environment this
 * suite does not run, and because the failure is silent in exactly the way
 * `batch.multicall` above is: deleting a `.catch` costs no test and no type
 * error, it just blanks the dashboard for anyone on v1.
 */
describe('the dashboard read survives a v1 account', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../lib/useAccountState.ts', import.meta.url)), 'utf8',
  )

  it.each(['pendingOwner', 'topUpEnabled'])('catches %s rather than failing the batch', (fn) => {
    const call = src.slice(src.indexOf(`functionName: '${fn}'`))
    expect(call.slice(0, call.indexOf('),') + 2)).toMatch(/\}\)\.catch\(/)
  })

  it('still reads them inside the array, so the batch is one request', () => {
    const batch = src.slice(src.indexOf('await Promise.all(['))
    const array = batch.slice(0, batch.indexOf('\n      ])'))
    for (const fn of ['pendingOwner', 'topUpEnabled']) {
      expect(array).toContain(`functionName: '${fn}'`)
    }
  })
})
