import { describe, it, expect } from 'vitest'
import { PROOFS, explorerUrl, shortHash } from '../lib/proofs.js'

describe('PROOFS', () => {
  it('carries the six mainnet proofs the README states', () => {
    expect(PROOFS).toHaveLength(6)
  })

  /**
   * The count is not the point; the deployment is.
   *
   * Until 2026-09-16 this file asserted five proofs and never asked which
   * contract they were about, so it stayed green while three of them pointed
   * at superseded deployments and the landing page linked readers there. A
   * count cannot catch that. This can.
   *
   * The settlement is the one exception and is listed rather than excluded by
   * a rule: it is an EIP-3009 transfer the facilitator submits, so its target
   * is the USDC token. That is the claim being made about it.
   */
  it('is about the live account, not a superseded deployment', () => {
    const SUPERSEDED = [
      '0x7ada926b021baef4896f51f237bca61435e43fd2',
      '0x895b773ef88ca27699df58f9f45962f847bbe9ce',
      '0x7156af4f9552a77736ad77772b46fd4d3c3c5e07',
    ]
    /**
     * The hashes those deployments' proofs were carried on, retired here so a
     * copy-paste from git history cannot quietly reintroduce one.
     *
     * Written as explorer URLs, not bare hashes, for the reason lib/proofs.ts
     * already records: scripts/check-secrets.sh exempts `/tx/0x…` and blocks a
     * loose 0x-plus-64-hex. The first draft of this list was bare and the
     * pre-commit guard refused it, which is the guard working.
     */
    const RETIRED = [
      'https://celoscan.io/tx/0x3fb0324fb3937ca53b0e37f232618975d86e9d0064cfd907de1b28ea6a851f70',
      'https://celoscan.io/tx/0xec08a20020983992d18d6faa7cccd91e0bba0f2432e6f22e534616b96f2f33db',
      'https://celoscan.io/tx/0xb5dd4d16a7e65453ddcdc70b235384a7bc20c8845a8ce5096084c7f7f2a91e25',
      'https://celoscan.io/tx/0x8a6f4d8cfd9d49d22f3948af384f87ba169533d903e12885aa3296bc0a2fc779',
      'https://celoscan.io/tx/0x0786b9796e73feee95e3ce5e19a1ad0b63559512bbbace3ee3e165be11628b21',
    ]
    for (const p of PROOFS) {
      for (const dead of [...SUPERSEDED, ...RETIRED]) {
        expect(p.url.toLowerCase(), `${p.claim} cites a retired proof or a superseded deployment`)
          .not.toContain(dead)
      }
    }
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
    // would be a lie; collapsing them into one row would hide a claim. Five
    // transactions carry six proofs.
    expect(new Set(PROOFS.map((p) => p.url)).size).toBe(5)
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
