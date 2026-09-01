import { describe, it, expect } from 'vitest'
import { fromDataSuffix } from '@celo/attribution-tags'
import { withAttribution } from '../src/attribution.js'

const TAG = 'celo_0123456789ab'

describe('withAttribution', () => {
  it('produces decodable calldata when there is no base calldata', () => {
    const data = withAttribution(undefined, TAG)
    const decoded = fromDataSuffix(data)
    expect(decoded).not.toBeNull()
    expect(decoded!.codes).toContain(TAG)
  })

  it('preserves the original calldata prefix', () => {
    const base = '0xdeadbeef' as const
    const data = withAttribution(base, TAG)
    expect(data.startsWith(base)).toBe(true)
    expect(data.length).toBeGreaterThan(base.length)
  })

  it('appends rather than replaces when called on already-tagged data', () => {
    const once = withAttribution('0xdeadbeef', TAG)
    const twice = withAttribution(once, TAG)
    expect(twice.length).toBeGreaterThan(once.length)
  })
})
