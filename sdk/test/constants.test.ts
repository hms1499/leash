import { describe, it, expect } from 'vitest'
import { isAddress, getAddress } from 'viem'
import {
  ATTRIBUTION_CODE_SHAPE, CELO_USDC, CELO_USDC_FEE_ADAPTER, KNOWN_FEE_ADAPTERS,
  LEASH_ATTRIBUTION_CODE,
} from '../src/constants.js'

/**
 * These two were bare hex literals in six places — four in `app/`, one in the
 * documented `.mcp.json`, and one more in every block a user pasted by hand —
 * and nothing anywhere could notice a transposed character. They are one
 * literal each now, and this file is the only place that pins the value.
 *
 * Both were read off Celo mainnet, not copied from a block explorer's search
 * box: spikes/README.md T0.1 enumerated the FeeCurrencyDirectory's 20 adapters
 * on 2026-09-02 and again on 2026-09-09.
 */
describe('the Celo mainnet defaults', () => {
  it('is USDC on Celo mainnet', () => {
    expect(CELO_USDC).toBe('0xcebA9300f2b948710d2653dD7B07f33A8B32118C')
  })

  it('is the USDC fee-currency adapter', () => {
    expect(CELO_USDC_FEE_ADAPTER).toBe('0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B')
  })

  /**
   * The failure this guards is silent in both directions. Spending the adapter
   * reads a balance from a contract that holds nothing; naming the token as
   * `feeCurrency` produces a CIP-64 envelope the node rejects, because only
   * directory-whitelisted adapters are accepted there.
   */
  it('does not confuse the token with the adapter', () => {
    expect(CELO_USDC).not.toBe(CELO_USDC_FEE_ADAPTER)
  })

  it('names an adapter the fee-currency directory actually whitelists', () => {
    expect(KNOWN_FEE_ADAPTERS).toContain(CELO_USDC_FEE_ADAPTER)
  })

  // The token is not an adapter, so it must not be in that list either.
  it('does not name the token as a fee adapter', () => {
    expect(KNOWN_FEE_ADAPTERS).not.toContain(CELO_USDC as never)
  })

  /**
   * Checksummed, because `mcp/src/config.ts` runs everything it reads through
   * `getAddress` and a default that did not match would compare unequal to the
   * same address supplied by hand.
   */
  it.each([CELO_USDC, CELO_USDC_FEE_ADAPTER])('%s is a checksummed address', (address) => {
    expect(isAddress(address)).toBe(true)
    expect(getAddress(address)).toBe(address)
  })
})

/**
 * The code Celo Builders issued to this project on 2026-09-02
 * (docs/registration.md). It is what credits on-chain volume, it is not
 * retroactive, and `leash-agentpay` now emits it on every transaction rather
 * than asking each user to supply a code standing for something they are not.
 */
describe('the project attribution code', () => {
  it('is the registered code, not a placeholder', () => {
    expect(LEASH_ATTRIBUTION_CODE).toBe('celo_3dec652cd977')
  })

  // The server checks ATTRIBUTION_TAG against this shape, so a code of our own
  // that failed it would be a rule we ship and do not keep.
  it('satisfies the shape the server demands of anyone else', () => {
    expect(ATTRIBUTION_CODE_SHAPE.test(LEASH_ATTRIBUTION_CODE)).toBe(true)
  })

  it.each(['celo_mytag', 'celo_3DEC652CD977', 'celo_3dec652cd97', '3dec652cd977', ''])(
    'rejects %o, which is what people actually type',
    (bad) => {
      expect(ATTRIBUTION_CODE_SHAPE.test(bad)).toBe(false)
    },
  )
})
