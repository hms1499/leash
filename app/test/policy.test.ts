import { describe, it, expect } from 'vitest'
import {
  spentToday, percentUsed, refusalThreshold, formatAmount, parseAmount,
} from '../lib/policy.js'

const USDC = 6

describe('spentToday', () => {
  it('is the difference between the cap and what is left', () => {
    expect(spentToday(1_000_000n, 980_773n)).toBe(19_227n)
  })

  it('is zero when nothing has been spent', () => {
    expect(spentToday(1_000_000n, 1_000_000n)).toBe(0n)
  })

  it('never goes negative if a read returns more than the cap', () => {
    expect(spentToday(1_000_000n, 1_200_000n)).toBe(0n)
  })
})

describe('percentUsed', () => {
  it('reports the fraction consumed', () => {
    expect(percentUsed(1_000_000n, 500_000n)).toBe(50)
  })

  it('is 100 when the allowance is exhausted', () => {
    expect(percentUsed(1_000_000n, 0n)).toBe(100)
  })

  // An unconfigured token has daily == 0, which is the contract's sentinel.
  // Dividing by it would produce NaN and render as "NaN%" next to money.
  it('is 0 for an unconfigured token rather than NaN', () => {
    expect(percentUsed(0n, 0n)).toBe(0)
  })
})

describe('refusalThreshold', () => {
  it('is the per-transaction cap while the daily allowance is ample', () => {
    expect(refusalThreshold(980_773n, 500_000n)).toBe(500_000n)
  })

  it('is the remaining allowance once that is the tighter limit', () => {
    expect(refusalThreshold(90_000n, 500_000n)).toBe(90_000n)
  })

  it('is zero when the allowance is spent', () => {
    expect(refusalThreshold(0n, 500_000n)).toBe(0n)
  })
})

describe('formatAmount', () => {
  it('renders six-decimal units in full', () => {
    expect(formatAmount(980_773n, USDC)).toBe('0.980773')
  })

  it('pads so the column does not jitter as values update', () => {
    expect(formatAmount(1_000_000n, USDC)).toBe('1.000000')
  })

  it('honours a shorter requested precision', () => {
    expect(formatAmount(980_773n, USDC, 2)).toBe('0.98')
  })
})

describe('parseAmount', () => {
  it('converts human units to atomic units', () => {
    expect(parseAmount('0.50', USDC)).toBe(500_000n)
  })

  it('accepts a whole number', () => {
    expect(parseAmount('1', USDC)).toBe(1_000_000n)
  })

  it('rejects a negative amount', () => {
    expect(() => parseAmount('-1', USDC)).toThrow(RangeError)
  })

  it('rejects text', () => {
    expect(() => parseAmount('abc', USDC)).toThrow(RangeError)
  })

  // More precision than the token has would silently truncate the user's
  // money. Refuse instead.
  it('rejects more decimal places than the token supports', () => {
    expect(() => parseAmount('0.1234567', USDC)).toThrow(RangeError)
  })
})
