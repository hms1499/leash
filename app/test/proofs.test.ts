import { describe, it, expect } from 'vitest'
import { PROOFS, explorerUrl, shortHash } from '../lib/proofs.js'

describe('PROOFS', () => {
  it('carries the five mainnet proofs the README states', () => {
    expect(PROOFS).toHaveLength(5)
  })

  it('every row links to a full 32-byte transaction on celoscan', () => {
    for (const p of PROOFS) {
      expect(p.url).toMatch(/^https:\/\/celoscan\.io\/tx\/0x[0-9a-f]{64}$/)
    }
  })

  it('no row ships without a claim and a detail', () => {
    for (const p of PROOFS) {
      expect(p.claim.length).toBeGreaterThan(0)
      expect(p.detail.length).toBeGreaterThan(0)
    }
  })

  it('reuses one transaction where one spend proves two things', () => {
    // The policy gate and the attribution round-trip are two separate claims
    // about the same spend. Splitting them across two invented transactions
    // would be a lie; collapsing them into one row would hide a claim. Four
    // transactions carry five proofs.
    expect(new Set(PROOFS.map((p) => p.url)).size).toBe(4)
  })
})

describe('explorerUrl', () => {
  it('points at celoscan', () => {
    expect(explorerUrl('0xabc')).toBe('https://celoscan.io/tx/0xabc')
  })
})

describe('shortHash', () => {
  it('shows both ends of the hash and elides the middle', () => {
    expect(shortHash('https://celoscan.io/tx/0xabcdef0123456789tail999'))
      .toBe('0xabcdef01…tail999')
  })
})
