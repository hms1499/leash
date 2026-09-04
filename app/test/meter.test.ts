import { describe, it, expect } from 'vitest'
import { meterState } from '../lib/meter.js'

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
