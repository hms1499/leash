import { describe, it, expect } from 'vitest'
import { pickFeeAdapter, NoFundedFeeAdapterError } from '../src/feeCurrency.js'

const A = '0x0000000000000000000000000000000000000001' as const
const B = '0x0000000000000000000000000000000000000002' as const

describe('pickFeeAdapter', () => {
  it('picks the only funded adapter', () => {
    const balances = new Map([[A, 0n], [B, 1_000_000n]])
    expect(pickFeeAdapter(balances, [A, B])).toBe(B)
  })

  it('prefers the adapter with the largest balance', () => {
    const balances = new Map([[A, 5n], [B, 1_000_000n]])
    expect(pickFeeAdapter(balances, [A, B])).toBe(B)
  })

  it('throws when no adapter is funded', () => {
    const balances = new Map([[A, 0n], [B, 0n]])
    expect(() => pickFeeAdapter(balances, [A, B])).toThrow(NoFundedFeeAdapterError)
  })

  it('ignores balances for adapters not on the whitelist', () => {
    const rogue = '0x0000000000000000000000000000000000000009' as const
    const balances = new Map([[A, 1n], [rogue, 10_000_000n]])
    expect(pickFeeAdapter(balances, [A, B])).toBe(A)
  })
})
