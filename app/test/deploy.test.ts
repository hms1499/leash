import { describe, it, expect } from 'vitest'
import { describeDeployReceipt } from '../lib/deploy.js'

const HASH = '0xabc' as `0x${string}`
const ADDRESS = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2' as `0x${string}`

describe('describeDeployReceipt', () => {
  it('refuses a reverted creation even though it carries an address', () => {
    // The case the guard exists for: go-ethereum sets contractAddress for any
    // `to == nil` transaction regardless of status, so the address alone was
    // letting a failed deployment through.
    const out = describeDeployReceipt({ status: 'reverted', contractAddress: ADDRESS }, HASH)
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.message).toContain('reverted')
  })

  it('says nothing was saved, so the message does not read as a network fault', () => {
    const out = describeDeployReceipt({ status: 'reverted', contractAddress: ADDRESS }, HASH)
    expect(out.ok === false && out.message).toContain('nothing was saved')
  })

  it('refuses a successful receipt that carries no address', () => {
    const out = describeDeployReceipt({ status: 'success', contractAddress: null }, HASH)
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.message).toContain('no contract address')
  })

  it('refuses a successful receipt with the field absent entirely', () => {
    const out = describeDeployReceipt({ status: 'success' }, HASH)
    expect(out.ok).toBe(false)
  })

  it('accepts a successful creation and hands back its address', () => {
    expect(describeDeployReceipt({ status: 'success', contractAddress: ADDRESS }, HASH))
      .toEqual({ ok: true, address: ADDRESS })
  })

  it('names the transaction in every refusal, so it can be looked up', () => {
    for (const r of [
      { status: 'reverted' as const, contractAddress: ADDRESS },
      { status: 'success' as const, contractAddress: null },
    ]) {
      const out = describeDeployReceipt(r, HASH)
      expect(out.ok === false && out.message).toContain(HASH)
    }
  })
})
