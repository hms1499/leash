import { describe, it, expect, vi } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
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
    expect(() => loadConfig({ ...ENV, SPEND_TOKEN: undefined })).toThrow(/SPEND_TOKEN/)
  })

  it('rejects a malformed address rather than failing at the first RPC call', () => {
    expect(() => loadConfig({ ...ENV, LEASH_ACCOUNT: 'not-an-address' })).toThrow(/LEASH_ACCOUNT/)
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
