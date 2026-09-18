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

/**
 * ERC-8021 carries several codes comma-delimited in one suffix, and the rule
 * that governs them is `@celo/attribution-tags`': each code is added only by
 * the entity it represents. `leash-agentpay` emits its own beside a builder's,
 * rather than choosing between them.
 */
describe('withAttribution, given several codes', () => {
  const OURS = 'celo_3dec652cd977'

  it('round-trips both codes out of one suffix', () => {
    const decoded = fromDataSuffix(withAttribution('0xdeadbeef', [OURS, TAG]))
    expect(decoded).not.toBeNull()
    expect(decoded!.codes).toEqual([OURS, TAG])
  })

  // Order is meaning here, not formatting: the app's own code comes first.
  it('keeps the order it was given', () => {
    const decoded = fromDataSuffix(withAttribution('0xdeadbeef', [TAG, OURS]))
    expect(decoded!.codes).toEqual([TAG, OURS])
  })

  it('still preserves the calldata prefix', () => {
    const base = '0xdeadbeef' as const
    expect(withAttribution(base, [OURS, TAG]).startsWith(base)).toBe(true)
  })

  // A one-element array and the bare string must not diverge; the server
  // passes an array of one whenever the caller supplied no code of their own.
  it('agrees with the single-code form for one code', () => {
    expect(withAttribution('0xdeadbeef', [TAG])).toBe(withAttribution('0xdeadbeef', TAG))
  })
})
