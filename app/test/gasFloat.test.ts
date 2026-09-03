import { describe, it, expect } from 'vitest'
import { transactionsLeft } from '../lib/gasFloat.js'

describe('transactionsLeft', () => {
  // Measured 2026-09-02: ~0.0028 USDC spent per transaction, ~0.0046
  // reserved before the node will simulate one at all.
  it('matches the measured float of the live operator', () => {
    expect(transactionsLeft(12_215n)).toBe(3)
  })

  it('is zero below the reserve, since nothing can be sent at all', () => {
    expect(transactionsLeft(4_000n)).toBe(0)
  })

  it('is one when the float covers the reserve but no more', () => {
    expect(transactionsLeft(4_600n)).toBe(1)
  })

  it('is zero for an empty wallet', () => {
    expect(transactionsLeft(0n)).toBe(0)
  })

  // These two pin COST_PER_TX exactly, given RESERVE = 4_600n: without them
  // the cost could be anything from 2_539 to 3_807 and every test above would
  // still pass.
  it('has not crossed the second cost step just below the boundary', () => {
    expect(transactionsLeft(7_399n)).toBe(1)
  })

  it('crosses the second cost step exactly at the boundary', () => {
    expect(transactionsLeft(7_400n)).toBe(2)
  })
})
