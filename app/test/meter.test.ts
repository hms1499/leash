import { describe, it, expect } from 'vitest'
import { meterState, spendBand } from '../lib/meter.js'

const base = {
  daily: 1_000_000n, remaining: 1_000_000n,
  paused: false, loading: false, visible: true, reduced: false,
}

describe('fillPercent', () => {
  it('is zero when nothing has been spent', () => {
    expect(meterState(base).fillPercent).toBe(0)
  })

  it('tracks what has been spent', () => {
    expect(meterState({ ...base, remaining: 250_000n }).fillPercent).toBeCloseTo(75, 5)
  })

  it('is zero while loading, because zero spent is not an observation', () => {
    expect(meterState({ ...base, remaining: 250_000n, loading: true }).fillPercent).toBe(0)
  })
})

describe('locked', () => {
  it('is true when the allowance is exhausted', () => {
    expect(meterState({ ...base, remaining: 0n }).locked).toBe(true)
  })

  it('is false when a cap of zero means no policy rather than a spent one', () => {
    expect(meterState({ ...base, daily: 0n, remaining: 0n }).locked).toBe(false)
  })

  it('is never claimed before the first read returns', () => {
    expect(meterState({ ...base, remaining: 0n, loading: true }).locked).toBe(false)
  })
})

describe('animating', () => {
  it('runs when the agent still has room', () => {
    expect(meterState({ ...base, remaining: 500_000n }).animating).toBe(true)
  })

  // The guarantee this project paid to learn: suppressing an <animate> in CSS
  // matches, applies, and does nothing, because SMIL has no renderer to
  // suppress. Only not mounting it stops the cost.
  it('stops when the OS asked for reduced motion', () => {
    expect(meterState({ ...base, reduced: true }).animating).toBe(false)
  })

  it('stops in a hidden tab', () => {
    expect(meterState({ ...base, visible: false }).animating).toBe(false)
  })

  it('stops dead at the cap', () => {
    expect(meterState({ ...base, remaining: 0n }).animating).toBe(false)
  })

  it('stops while paused', () => {
    expect(meterState({ ...base, paused: true }).animating).toBe(false)
  })

  it('stops before the first read returns', () => {
    expect(meterState({ ...base, loading: true }).animating).toBe(false)
  })
})

describe('spendBand', () => {
  const band = {
    remaining: 1_000_000n, perTx: 500_000n, balance: 2_000_000n,
    paused: false, loading: false,
  }

  it('states nothing before the first read returns', () => {
    expect(spendBand({ ...band, loading: true })).toEqual({ kind: 'loading' })
  })

  it('reports the owner stopping the account above everything else', () => {
    expect(spendBand({ ...band, paused: true, balance: 0n })).toEqual({ kind: 'paused' })
  })

  it('reports an empty account, which no cap describes', () => {
    // The meter reads a full allowance on an account holding nothing, and
    // every spend still reverts -- execute() consumes the cap, then the ERC-20
    // transfer fails. Measured on 0xA73DB76f: remainingToday 1.000000 against
    // a balance of 0.
    expect(spendBand({ ...band, balance: 0n })).toEqual({ kind: 'unfunded' })
  })

  it('prefers the empty account to the spent allowance, because midnight does not fix it', () => {
    expect(spendBand({ ...band, balance: 0n, remaining: 0n })).toEqual({ kind: 'unfunded' })
  })

  it('reports the spent allowance when there is money behind it', () => {
    expect(spendBand({ ...band, remaining: 0n })).toEqual({ kind: 'exhausted' })
  })

  it('takes the per-transaction cap when it is the tightest', () => {
    expect(spendBand(band)).toEqual({ kind: 'ceiling', amount: 500_000n })
  })

  it('takes what is left today when that is tighter than the cap', () => {
    expect(spendBand({ ...band, remaining: 200_000n }))
      .toEqual({ kind: 'ceiling', amount: 200_000n })
  })

  it('takes the balance when the account holds less than either cap', () => {
    expect(spendBand({ ...band, balance: 100_000n }))
      .toEqual({ kind: 'ceiling', amount: 100_000n })
  })
})
