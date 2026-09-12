import { describe, it, expect } from 'vitest'
import {
  describePreCheckFailure, InsufficientGasReserveError, translateSendFailure,
} from '../src/policyClient.js'

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

  it('names the owner as the only party who can clear a disabled top-up', () => {
    const result = describePreCheckFailure({ name: 'TopUpDisabled', args: [] })
    expect(result).toEqual({ ok: false, error: 'top_up_disabled', spent: 0n, cap: 0n })
  })

  // The code has to be asserted alongside the zeroes or this test proves
  // nothing: the unknown_policy_error fallback also returns 0n/0n, so a
  // version of the switch that was never mapped passes a cap-only assertion.
  it('does not invent a cap for a refusal that carried none', () => {
    const result = describePreCheckFailure({ name: 'TopUpDisabled', args: [] })
    if (result.ok) throw new Error('expected a refusal')
    expect(result.error).toBe('top_up_disabled')
    expect(result.cap).toBe(0n)
    expect(result.spent).toBe(0n)
  })
})

describe('translateSendFailure', () => {
  // The exact string forno returned on 2026-09-12, with the operator 180
  // atomic units short of the reserve. viem's own shortMessage for it is
  // "Missing or invalid parameters", which is what a reader saw while the
  // truth sat one level down in `details`.
  const NODE_TEXT =
    'insufficient fee-currency balance: required 11603484774000000, '
    + 'available 11423000000000000 for sender 0xd44d in fee-currency 0x2F25'

  it('names a gas-reserve shortfall instead of blaming the parameters', () => {
    const out = translateSendFailure(
      Object.assign(new Error('Missing or invalid parameters.'), { details: NODE_TEXT }),
    ) as InsufficientGasReserveError
    expect(out).toBeInstanceOf(InsufficientGasReserveError)
    expect(out.code).toBe('insufficient_gas_reserve')
    expect(out.message).not.toMatch(/parameters/i)
    expect(out.message).toMatch(/nothing was sent/i)
  })

  it('carries the two figures the node stated, unconverted', () => {
    const out = translateSendFailure(
      Object.assign(new Error('x'), { details: NODE_TEXT }),
    ) as InsufficientGasReserveError
    expect(out.required).toBe(11_603_484_774_000_000n)
    expect(out.available).toBe(11_423_000_000_000_000n)
  })

  it('reads the detail through viem’s cause as well as off the error', () => {
    const out = translateSendFailure(
      Object.assign(new Error('x'), { cause: { details: NODE_TEXT } }),
    )
    expect(out).toBeInstanceOf(InsufficientGasReserveError)
  })

  // Every other failure must pass through untouched. A translator that
  // swallowed unrelated errors would hide the next real one.
  it('leaves an unrelated failure exactly as it was', () => {
    const original = Object.assign(new Error('nonce too low'), { details: 'nonce too low' })
    expect(translateSendFailure(original)).toBe(original)
  })

  // Waiting never clears this, and the owner is the only party who can. Same
  // sentence shape as every other refusal only the owner can lift.
  it('says who can fix it and that waiting will not', () => {
    const out = translateSendFailure(
      Object.assign(new Error('x'), { details: NODE_TEXT }),
    ) as InsufficientGasReserveError
    expect(out.message).toMatch(/owner/i)
    expect(out.message).toMatch(/waiting does not/i)
    expect(out.message).not.toMatch(/midnight/i)
  })
})
