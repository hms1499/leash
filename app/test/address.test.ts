import { describe, it, expect } from 'vitest'
import { isValidAddress, truncateAddress } from '../lib/address.js'

describe('isValidAddress', () => {
  it('accepts a checksummed address', () => {
    expect(isValidAddress('0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57')).toBe(true)
  })

  it('accepts an all-lowercase address', () => {
    expect(isValidAddress('0x2b33cb68c4d826a4fc36264bcdb46081c99f4f57')).toBe(true)
  })

  it('rejects a string that is too short', () => {
    expect(isValidAddress('0x2B33cb68')).toBe(false)
  })

  it('rejects a 64-hex private key, which must never be pasted here', () => {
    expect(isValidAddress('0x' + 'a'.repeat(64))).toBe(false)
  })
})

describe('truncateAddress', () => {
  it('keeps the first six and last four characters', () => {
    expect(truncateAddress('0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'))
      .toBe('0x2B33…4f57')
  })

  it('returns a short string unchanged rather than mangling it', () => {
    expect(truncateAddress('0x2B33')).toBe('0x2B33')
  })
})
