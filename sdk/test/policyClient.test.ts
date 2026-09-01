import { describe, it, expect } from 'vitest'
import { describePreCheckFailure } from '../src/policyClient.js'

describe('describePreCheckFailure', () => {
  it('turns a DailyCapExceeded revert into LLM-readable JSON', () => {
    const out = describePreCheckFailure({
      name: 'DailyCapExceeded',
      args: [18_400_000n, 5_000_000n, 20_000_000n],
    })
    expect(out).toEqual({
      ok: false,
      error: 'daily_cap_exceeded',
      spent: 18_400_000n,
      cap: 20_000_000n,
    })
  })

  it('turns a PerTxCapExceeded revert into LLM-readable JSON', () => {
    const out = describePreCheckFailure({
      name: 'PerTxCapExceeded',
      args: [11_000_000n, 10_000_000n],
    })
    expect(out).toEqual({
      ok: false,
      error: 'per_tx_cap_exceeded',
      spent: 0n,
      cap: 10_000_000n,
    })
  })

  it('turns PayeeNotAllowed into LLM-readable JSON', () => {
    const out = describePreCheckFailure({
      name: 'PayeeNotAllowed',
      args: ['0x00000000000000000000000000000000000000bd'],
    })
    expect(out).toEqual({
      ok: false,
      error: 'payee_not_allowed',
      spent: 0n,
      cap: 0n,
    })
  })

  it('falls back to a named unknown error rather than throwing', () => {
    const out = describePreCheckFailure({ name: 'SomethingElse', args: [] })
    expect(out.ok).toBe(false)
    // Narrows `out` for tsc --strict: `expect(out.ok).toBe(false)` above
    // asserts at runtime but doesn't narrow the `PreCheckResult` union type,
    // so `out.error` is unreachable on the `{ ok: true }` branch without this.
    if (out.ok) throw new Error('unreachable')
    expect(out.error).toBe('unknown_policy_error')
  })
})
