import { describe, it, expect, vi } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { loadConfig } from '../src/config.js'
import { payTool } from '../src/tools/pay.js'

const ENV = {
  LEASH_ACCOUNT: '0x895B773Ef88cA27699Df58F9F45962F847bbE9CE',
  // Generated, never a literal — see the note in sdk/test/x402/payment.test.ts.
  OPERATOR_PK: generatePrivateKey(),
  ATTRIBUTION_TAG: 'celo_3dec652cd977',
  SPEND_TOKEN: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  FEE_ADAPTER: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
} as NodeJS.ProcessEnv
const config = loadConfig(ENV)
const fees = new Map([[config.feeAdapter, 1_000_000n]])
const PAYEE = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'

describe('payTool', () => {
  it('spends and reports the transaction', async () => {
    const leash = {
      preCheck: vi.fn().mockResolvedValue({ ok: true }),
      spend: vi.fn().mockResolvedValue('0xpaid'),
    } as never
    const out = await payTool({ leash, config, feeBalances: fees }, { to: PAYEE, amount: '0.25' })
    expect(out.transaction).toBe('0xpaid')
    expect((leash as never as { spend: ReturnType<typeof vi.fn> }).spend)
      .toHaveBeenCalledWith(config.token, PAYEE, 250_000n, fees)
  })

  // A cap refusal has to arrive as numbers an agent can reason with, or it
  // will retry the identical amount forever.
  it('returns the cap and what is left when policy refuses', async () => {
    const leash = {
      preCheck: vi.fn().mockResolvedValue({
        ok: false, error: 'daily_cap_exceeded', spent: 900_000n, cap: 1_000_000n,
      }),
      spend: vi.fn(),
    } as never
    const out = await payTool({ leash, config, feeBalances: fees }, { to: PAYEE, amount: '0.50' })
    expect(out.error).toBe('daily_cap_exceeded')
    expect(out.spent_today).toBe('0.900000')
    expect(out.daily_cap).toBe('1.000000')
    expect(out.remaining_today).toBe('0.100000')
    expect(out.suggestion).toMatch(/0\.100000|smaller|wait/i)
    expect((leash as never as { spend: ReturnType<typeof vi.fn> }).spend).not.toHaveBeenCalled()
  })

  it('refuses a payee that is not an address before touching the chain', async () => {
    const leash = { preCheck: vi.fn(), spend: vi.fn() } as never
    const out = await payTool({ leash, config, feeBalances: fees }, { to: 'alice', amount: '1' })
    expect(out.error).toBe('invalid_payee')
    expect((leash as never as { preCheck: ReturnType<typeof vi.fn> }).preCheck).not.toHaveBeenCalled()
  })

  it('refuses an unparseable amount', async () => {
    const leash = { preCheck: vi.fn(), spend: vi.fn() } as never
    const out = await payTool({ leash, config, feeBalances: fees }, { to: PAYEE, amount: 'a lot' })
    expect(out.error).toBe('invalid_amount')
  })
})
