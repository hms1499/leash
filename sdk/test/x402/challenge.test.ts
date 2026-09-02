import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseChallenge, selectTerms, X402ChallengeError } from '../../src/x402/challenge.js'

const raw = JSON.parse(
  readFileSync(new URL('../fixtures/challenge-usebuy.json', import.meta.url), 'utf8'),
)

describe('parseChallenge', () => {
  it('reads both accepted assets out of a real gateway challenge', () => {
    const c = parseChallenge(raw)
    expect(c.x402Version).toBe(1)
    expect(c.accepts).toHaveLength(2)
    expect(c.accepts[0].maxAmountRequired).toBe(16753n)
    expect(c.accepts[0].asset).toBe('0xcebA9300f2b948710d2653dD7B07f33A8B32118C')
    expect(c.accepts[0].tokenName).toBe('USDC')
    expect(c.accepts[0].tokenVersion).toBe('2')
  })

  // extra.name and extra.version are the token's EIP-712 domain. They are
  // published nowhere else, and a signature built without them is silently
  // invalid rather than rejected, so a challenge missing them must be refused.
  it('refuses a challenge whose terms carry no EIP-712 domain', () => {
    const bad = { x402Version: 1, accepts: [{ ...raw.accepts[0], extra: {} }] }
    expect(() => parseChallenge(bad)).toThrow(X402ChallengeError)
  })

  it('refuses a network this client cannot sign for', () => {
    const bad = { x402Version: 1, accepts: [{ ...raw.accepts[0], network: 'base' }] }
    expect(() => parseChallenge(bad)).toThrow(/celo/)
  })

  it('refuses a scheme other than exact', () => {
    const bad = { x402Version: 1, accepts: [{ ...raw.accepts[0], scheme: 'upto' }] }
    expect(() => parseChallenge(bad)).toThrow(/exact/)
  })
})

describe('selectTerms', () => {
  it('defaults to the first accepted asset', () => {
    expect(selectTerms(parseChallenge(raw)).tokenName).toBe('USDC')
  })

  it('honours an explicit asset preference', () => {
    const t = selectTerms(parseChallenge(raw), '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e')
    expect(t.tokenName).toBe('Tether USD')
  })

  it('refuses a preference the gateway does not accept', () => {
    expect(() =>
      selectTerms(parseChallenge(raw), '0x0000000000000000000000000000000000000001'),
    ).toThrow(X402ChallengeError)
  })
})
