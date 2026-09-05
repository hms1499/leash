import { describe, it, expect, vi } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { describePreCheckFailure } from '@leash/sdk'
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

  // Every refusal below is built from the SDK's own describePreCheckFailure
  // rather than a hand-written shape, so a change to what the SDK reports
  // fails here instead of silently reaching an agent as a wrong number.
  const refusedBy = (name: string, args: readonly unknown[], remainingToday?: bigint) => ({
    preCheck: vi.fn().mockResolvedValue(describePreCheckFailure({ name, args })),
    spend: vi.fn(),
    remainingToday: remainingToday === undefined
      ? vi.fn().mockRejectedValue(new Error('rpc down'))
      : vi.fn().mockResolvedValue(remainingToday),
  })

  // PerTxCapExceeded carries the per-transaction cap. Reporting it as
  // daily_cap told an agent its daily allowance was 0.50 on an account whose
  // daily cap was 1.00 — measured against mainnet 2026-09-05.
  it('names the per-transaction cap as such, and reads the day separately', async () => {
    const leash = refusedBy('PerTxCapExceeded', [900_000n, 500_000n], 1_000_000n)
    const out = await payTool({ leash: leash as never, config, feeBalances: fees }, { to: PAYEE, amount: '0.90' })
    expect(out.error).toBe('per_tx_cap_exceeded')
    expect(out.per_tx_cap).toBe('0.500000')
    expect(out.remaining_today).toBe('1.000000')
    expect(out.daily_cap).toBeUndefined()
    expect(out.suggestion).toContain('0.500000')
  })

  // Whichever bound bites first is the one an agent should retry under.
  it('suggests the daily remainder when it is tighter than the per-tx cap', async () => {
    const leash = refusedBy('PerTxCapExceeded', [900_000n, 500_000n], 120_000n)
    const out = await payTool({ leash: leash as never, config, feeBalances: fees }, { to: PAYEE, amount: '0.90' })
    expect(out.suggestion).toContain('0.120000')
  })

  // A failed read must not become a wrong number.
  it('omits the daily figure when it cannot be read', async () => {
    const leash = refusedBy('PerTxCapExceeded', [900_000n, 500_000n])
    const out = await payTool({ leash: leash as never, config, feeBalances: fees }, { to: PAYEE, amount: '0.90' })
    expect(out.remaining_today).toBeUndefined()
    expect(out.per_tx_cap).toBe('0.500000')
    expect(out.suggestion).toMatch(/leash_status/)
  })

  // The worst of the old shape: an owner presses Stop, and the agent is told
  // its allowance is exhausted and to wait for a reset that clears nothing.
  it('does not tell a paused agent to wait for the daily reset', async () => {
    const leash = refusedBy('ContractPaused', [], 1_000_000n)
    const out = await payTool({ leash: leash as never, config, feeBalances: fees }, { to: PAYEE, amount: '0.01' })
    expect(out.error).toBe('account_paused')
    expect(out.daily_cap).toBeUndefined()
    expect(out.remaining_today).toBeUndefined()
    expect(out.suggestion).toMatch(/paused/i)
    expect(out.suggestion).toMatch(/does not clear/i)
  })

  it.each([
    ['NotOperator', [], 'not_an_operator', /setOperator/],
    ['PayeeNotAllowed', ['0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'], 'payee_not_allowed', /allowlist/i],
    ['TokenNotConfigured', ['0xcebA9300f2b948710d2653dD7B07f33A8B32118C'], 'token_not_configured', /froze|policy/i],
  ])('reports %s without inventing cap figures', async (name, args, code, hint) => {
    const leash = refusedBy(name, args, 1_000_000n)
    const out = await payTool({ leash: leash as never, config, feeBalances: fees }, { to: PAYEE, amount: '0.01' })
    expect(out.error).toBe(code)
    expect(out.daily_cap).toBeUndefined()
    expect(out.remaining_today).toBeUndefined()
    expect(out.suggestion).toMatch(hint)
    expect(out.suggestion).not.toMatch(/allowance is spent/i)
  })

  it('names the payee that the allowlist refused', async () => {
    const leash = refusedBy('PayeeNotAllowed', [PAYEE], 1_000_000n)
    const out = await payTool({ leash: leash as never, config, feeBalances: fees }, { to: PAYEE, amount: '0.01' })
    expect(out.payee).toBe(PAYEE)
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
