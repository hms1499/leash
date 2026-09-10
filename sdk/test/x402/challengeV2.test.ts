import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseChallengeV2, selectTerms, X402ChallengeError } from '../../src/x402/challenge.js'

// A real PAYMENT-REQUIRED header from agent402.tools/api/tls-cert, decoded and
// stored verbatim. Thirteen accepted entries across eight chains, of which
// exactly one is Celo — which is the whole reason these tests exist.
const raw = JSON.parse(
  readFileSync(new URL('../fixtures/challenge-agent402-v2.json', import.meta.url), 'utf8'),
)

const CELO_USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'

describe('parseChallengeV2', () => {
  it('reads the Celo terms out of a real multi-chain challenge', () => {
    const c = parseChallengeV2(raw)
    const t = selectTerms(c, CELO_USDC)

    expect(c.x402Version).toBe(2)
    // v2 renamed the price field to `amount`; it still normalises to the same
    // property, so everything downstream of the parser is untouched.
    expect(t.maxAmountRequired).toBe(1000n)
    expect(t.asset).toBe(CELO_USDC)
    expect(t.tokenName).toBe('USDC')
    expect(t.tokenVersion).toBe('2')
  })

  // The v1 parser maps every entry and throws on the first one it dislikes. A
  // real v2 challenge legitimately carries Solana, Stellar and Algorand terms
  // whose `asset` is not an EVM address at all, so that rule would reject the
  // whole challenge before ever reaching the Celo entry sitting at index 8.
  it('skips entries it cannot sign for instead of rejecting the challenge', () => {
    const c = parseChallengeV2(raw)
    expect(c.accepts.length).toBeGreaterThan(0)
    expect(c.accepts.every((t) => t.network === 'eip155:42220')).toBe(true)
  })

  // v2 requires the client to echo the chosen entry back as `accepted`, plus
  // the top-level `resource` block. The v1 parser normalises those away, so
  // the raw shapes have to survive parsing or the payload cannot be built.
  it('keeps the verbatim entry and resource block that v2 makes the client echo', () => {
    const t = selectTerms(parseChallengeV2(raw), CELO_USDC)

    expect(t.raw).toMatchObject({
      scheme: 'exact',
      network: 'eip155:42220',
      amount: '1000',
      asset: CELO_USDC,
    })
    expect(t.resourceInfo).toMatchObject({ url: 'https://agent402.tools/api/tls-cert' })
  })

  it('refuses a challenge with nothing payable on a supported chain', () => {
    const bad = { ...raw, accepts: raw.accepts.filter((a: { network: string }) => a.network !== 'eip155:42220') }
    expect(() => parseChallengeV2(bad)).toThrow(X402ChallengeError)
  })
})
