import { describe, it, expect, vi } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { CELO_USDC, CELO_USDC_FEE_ADAPTER } from '@leash/sdk'
import { loadConfig } from '../src/config.js'
import { statusTool } from '../src/tools/status.js'

const ENV = {
  LEASH_ACCOUNT: '0x895B773Ef88cA27699Df58F9F45962F847bbE9CE',
  // Generated, never a literal — see the note in sdk/test/x402/payment.test.ts.
  OPERATOR_PK: generatePrivateKey(),
  ATTRIBUTION_TAG: 'celo_3dec652cd977',
  SPEND_TOKEN: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  FEE_ADAPTER: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
} as NodeJS.ProcessEnv

describe('loadConfig', () => {
  it('names the variable that is missing, not just that something is', () => {
    expect(() => loadConfig({ ...ENV, LEASH_ACCOUNT: undefined })).toThrow(/LEASH_ACCOUNT/)
  })

  it('rejects a malformed address rather than failing at the first RPC call', () => {
    expect(() => loadConfig({ ...ENV, LEASH_ACCOUNT: 'not-an-address' })).toThrow(/LEASH_ACCOUNT/)
  })

  /**
   * SPEND_TOKEN and FEE_ADAPTER were required until 0.4.0, and this file used
   * to assert that a missing SPEND_TOKEN threw. Two 42-character addresses the
   * user could not verify sat in front of every handoff for no gain: the
   * product has only ever supported USDC on Celo mainnet, and both values were
   * already hardcoded in app/ and in the documented block.
   */
  describe('the two addresses the user should not have to type', () => {
    const minimal = {
      LEASH_ACCOUNT: ENV.LEASH_ACCOUNT,
      OPERATOR_PK: ENV.OPERATOR_PK,
      ATTRIBUTION_TAG: ENV.ATTRIBUTION_TAG,
    } as NodeJS.ProcessEnv

    it('starts on three variables alone', () => {
      expect(() => loadConfig(minimal)).not.toThrow()
    })

    it('defaults to USDC and its fee adapter on Celo mainnet', () => {
      const config = loadConfig(minimal)
      expect(config.token).toBe(CELO_USDC)
      expect(config.feeAdapter).toBe(CELO_USDC_FEE_ADAPTER)
    })

    // The adapter is a FeeCurrencyWrapper, not the token. Swapping the two
    // produces a wallet that cannot pay for gas, and nothing says so until a
    // transaction is rejected at the node.
    it('does not confuse the token with its adapter', () => {
      expect(CELO_USDC).not.toBe(CELO_USDC_FEE_ADAPTER)
    })

    it('still lets an explicit value win', () => {
      const other = '0x765DE816845861e75A25fCA122bb6898B8B1282a'
      const config = loadConfig({ ...minimal, SPEND_TOKEN: other, FEE_ADAPTER: other })
      expect(config.token).toBe(other)
      expect(config.feeAdapter).toBe(other)
      expect(config.tokenFromDefault).toBe(false)
    })

    /**
     * A default that quietly replaced a typo would be worse than the variable
     * being required: the user is told nothing and the agent spends a token
     * they did not name.
     */
    it('refuses a value that is set but malformed rather than falling back', () => {
      expect(() => loadConfig({ ...minimal, SPEND_TOKEN: 'not-an-address' }))
        .toThrow(/SPEND_TOKEN/)
      expect(() => loadConfig({ ...minimal, FEE_ADAPTER: 'not-an-address' }))
        .toThrow(/FEE_ADAPTER/)
    })

    it('records where the token came from, which is what the note depends on', () => {
      expect(loadConfig(minimal).tokenFromDefault).toBe(true)
    })
  })
})

describe('statusTool', () => {
  const config = loadConfig(ENV)

  it('reports the allowance in human units alongside the atomic ones', async () => {
    const leash = {
      remainingToday: vi.fn().mockResolvedValue(750_000n),
      operatorBalance: vi.fn().mockResolvedValue(1_030_794n),
      accountBalance: vi.fn().mockResolvedValue(1_499_999n),
      limits: vi.fn().mockResolvedValue({ perTx: 500_000n, daily: 1_000_000n, spentToday: 250_000n }),
    } as never
    const out = await statusTool({ leash, config })

    expect(out.remaining_today).toBe('0.750000')
    expect(out.remaining_today_atomic).toBe('750000')
    expect(out.daily_cap).toBe('1.000000')
    expect(out.spent_today).toBe('0.250000')
  })

  // An agent asked to spend needs to know whether it can, not to infer it.
  it('says plainly whether a spend is possible right now', async () => {
    const leash = {
      remainingToday: vi.fn().mockResolvedValue(0n),
      operatorBalance: vi.fn().mockResolvedValue(0n),
      accountBalance: vi.fn().mockResolvedValue(1_499_999n),
      limits: vi.fn().mockResolvedValue({ perTx: 500_000n, daily: 1_000_000n, spentToday: 1_000_000n }),
    } as never
    const out = await statusTool({ leash, config })
    expect(out.can_spend).toBe(false)
    expect(String(out.resets_in)).toMatch(/\d/)
  })
})

/**
 * The cost of not making the user type SPEND_TOKEN: a zero cap now has two
 * causes that look identical from the outside, and the agent reading this
 * output is the only thing standing between the user and "it just says I
 * cannot spend and will not say why".
 */
describe('statusTool, when the token was defaulted', () => {
  const zeroPolicy = {
    remainingToday: vi.fn().mockResolvedValue(0n),
    operatorBalance: vi.fn().mockResolvedValue(0n),
    accountBalance: vi.fn().mockResolvedValue(5_000_000n),
    limits: vi.fn().mockResolvedValue({ perTx: 0n, daily: 0n, spentToday: 0n }),
  } as never

  const defaulted = loadConfig({
    LEASH_ACCOUNT: ENV.LEASH_ACCOUNT,
    OPERATOR_PK: ENV.OPERATOR_PK,
    ATTRIBUTION_TAG: ENV.ATTRIBUTION_TAG,
  } as NodeJS.ProcessEnv)

  it('says the policy may simply be on another token', async () => {
    const out = await statusTool({ leash: zeroPolicy, config: defaulted })
    expect(out.note).toMatch(/SPEND_TOKEN/)
    expect(out.note).toMatch(/different token/)
    expect(out.can_spend).toBe(false)
  })

  // An exhausted allowance is not a misconfiguration, and saying so would
  // send the user to edit a file when all they have to do is wait.
  it('stays quiet when a policy exists and the day is merely spent', async () => {
    const out = await statusTool({
      leash: {
        remainingToday: vi.fn().mockResolvedValue(0n),
        operatorBalance: vi.fn().mockResolvedValue(0n),
        accountBalance: vi.fn().mockResolvedValue(5_000_000n),
        limits: vi.fn().mockResolvedValue({ perTx: 500_000n, daily: 1_000_000n, spentToday: 1_000_000n }),
      } as never,
      config: defaulted,
    })
    expect(out.note).toBeUndefined()
  })

  /**
   * A user who set SPEND_TOKEN themselves and sees a zero cap has a different
   * problem. Telling them to set the variable they already set is the wrong
   * direction, so the note is gated on the token having been defaulted.
   */
  it('stays quiet when the user named the token themselves', async () => {
    const out = await statusTool({ leash: zeroPolicy, config: loadConfig(ENV) })
    expect(out.note).toBeUndefined()
  })
})
