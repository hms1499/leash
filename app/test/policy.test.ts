import { describe, it, expect } from 'vitest'
import {
  spentToday, percentUsed, refusalThreshold, formatAmount, parseAmount, canEdit,
  validateLimits,
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

describe('canEdit', () => {
  it('lets the owner write', () => {
    expect(canEdit('0xAbC0000000000000000000000000000000000001',
                   '0xabc0000000000000000000000000000000000001')).toBe(true)
  })

  it('compares case-insensitively, since one side is checksummed', () => {
    expect(canEdit('0xABC0000000000000000000000000000000000001',
                   '0xabc0000000000000000000000000000000000001')).toBe(true)
  })

  it('refuses a different wallet', () => {
    expect(canEdit('0xAbC0000000000000000000000000000000000001',
                   '0xdEf0000000000000000000000000000000000002')).toBe(false)
  })

  it('refuses when no wallet is connected', () => {
    expect(canEdit('0xAbC0000000000000000000000000000000000001', undefined)).toBe(false)
  })

  it('refuses when the owner has not loaded yet', () => {
    expect(canEdit(null, '0xabc0000000000000000000000000000000000001')).toBe(false)
  })
})

describe('validateLimits', () => {
  const current = { perTx: 500_000n, daily: 1_000_000n }

  it('accepts a well-formed change', () => {
    const r = validateLimits('0.25', '2.00', USDC, current)
    expect(r).toEqual({ ok: true, perTx: 250_000n, daily: 2_000_000n })
  })

  it('rejects a per-transaction cap above the daily cap', () => {
    const r = validateLimits('5.00', '1.00', USDC, current)
    expect(r.ok).toBe(false)
  })

  // daily == 0 is the contract's TokenNotConfigured sentinel
  // (SpendPolicyAccount.sol:85). Saving it does not "set no limit" — it
  // makes every operator path revert, which is indistinguishable from a
  // broken agent. The Stop button is how an owner halts spending.
  it('refuses a daily cap of zero, which would disable the account', () => {
    const r = validateLimits('0.50', '0', USDC, current)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Stop/)
  })

  it('refuses a per-transaction cap of zero, which refuses every spend', () => {
    const r = validateLimits('0', '1.00', USDC, current)
    expect(r.ok).toBe(false)
  })

  // Without this, saving the values already on chain "confirms" on the first
  // poll iteration without any transaction having landed — the UI would
  // report a success it never observed.
  it('refuses a save that would change nothing', () => {
    const r = validateLimits('0.50', '1.00', USDC, current)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/already/)
  })

  it('reports the parse error for a non-numeric amount', () => {
    const r = validateLimits('half a dollar', '1.00', USDC, current)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/positive decimal/)
  })

  it('validates without a current value, for an account with no policy yet', () => {
    const r = validateLimits('0.50', '5.00', USDC)
    expect(r).toEqual({ ok: true, perTx: 500_000n, daily: 5_000_000n })
  })
})
