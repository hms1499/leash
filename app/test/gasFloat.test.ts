import { describe, it, expect } from 'vitest'
import { planRefuel, transactionsLeft } from '../lib/gasFloat.js'

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

describe('planRefuel', () => {
  const REQUESTED = 50_000n // 0.05 USDC, what the button offers

  it('refuses an empty account rather than sweeping zero', () => {
    expect(planRefuel(0n, REQUESTED)).toEqual({ ok: false, reason: 'empty' })
  })

  it('refuses a balance that cannot buy even one agent transaction', () => {
    // Below RESERVE a node will not simulate the transaction at all, so the
    // sweep would cost the owner gas and leave the agent still stalled.
    expect(planRefuel(4_599n, REQUESTED)).toEqual({ ok: false, reason: 'below-reserve' })
  })

  it('accepts exactly the reserve', () => {
    expect(planRefuel(4_600n, REQUESTED)).toEqual({ ok: true, amount: 4_600n })
  })

  it('sends the full request when the account can cover it', () => {
    expect(planRefuel(2_000_000n, REQUESTED)).toEqual({ ok: true, amount: REQUESTED })
  })

  it('sends what is there when the account holds less than the request', () => {
    // The defect: a fixed 0.05 against a balance of 0.02 reverted, and the
    // revert read as a slow chain because the operator balance never rose.
    expect(planRefuel(20_000n, REQUESTED)).toEqual({ ok: true, amount: 20_000n })
  })

  it('never plans an amount the account does not hold', () => {
    for (const balance of [4_600n, 20_000n, 49_999n, 50_000n, 1_000_000n]) {
      const out = planRefuel(balance, REQUESTED)
      expect(out.ok && out.amount <= balance).toBe(true)
    }
  })
})
