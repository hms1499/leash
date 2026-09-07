import { describe, it, expect, vi } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { loadConfig } from '../src/config.js'
import { fetchTool } from '../src/tools/fetch.js'

const ENV = {
  LEASH_ACCOUNT: '0x895B773Ef88cA27699Df58F9F45962F847bbE9CE',
  // Generated, never a literal — see the note in sdk/test/x402/payment.test.ts.
  OPERATOR_PK: generatePrivateKey(),
  ATTRIBUTION_TAG: 'celo_3dec652cd977',
  SPEND_TOKEN: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  FEE_ADAPTER: '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B',
} as NodeJS.ProcessEnv
const config = loadConfig(ENV)
const URL_ = 'https://usebuy.ai/gcloud/vm'

describe('fetchTool', () => {
  it('quotes without paying when asked to', async () => {
    const deps = {
      config,
      quote: vi.fn().mockResolvedValue({
        terms: { maxAmountRequired: 16753n, asset: config.token, description: 'e2-micro VM' },
        x402Version: 1,
      }),
      payForResource: vi.fn(),
    } as never
    const out = await fetchTool(deps, { url: URL_, max_amount: '1', quote_only: true })
    expect(out.price).toBe('0.016753')
    expect((deps as never as { payForResource: ReturnType<typeof vi.fn> }).payForResource)
      .not.toHaveBeenCalled()
  })

  it('reports what it drew from the contract, not just what it paid', async () => {
    const deps = {
      config,
      quote: vi.fn(),
      payForResource: vi.fn().mockResolvedValue({
        paid: 16753n,
        toppedUp: 10_000n,
        topUpTx: '0xtopup',
        result: { status: 200, body: { instance: 'vm-1' }, settlement: { success: true, transaction: '0xpaid' } },
      }),
    } as never
    const out = await fetchTool(deps, { url: URL_, max_amount: '1' })
    expect(out.paid).toBe('0.016753')
    expect(out.drawn_from_account).toBe('0.010000')
    expect(out.top_up_transaction).toBe('0xtopup')
    expect(out.settlement_transaction).toBe('0xpaid')
  })

  // The dangerous failure. An agent must be told, in the response, not to retry.
  it('warns unmistakably when a failure may already have taken the money', async () => {
    const err = Object.assign(new Error('gateway 502'), {
      code: 'gateway_error', mayHaveSettled: true,
    })
    const deps = { config, quote: vi.fn(), payForResource: vi.fn().mockRejectedValue(err) } as never
    const out = await fetchTool(deps, { url: URL_, max_amount: '1' })
    expect(out.error).toBe('gateway_error')
    expect(out.may_have_settled).toBe(true)
    expect(String(out.suggestion)).toMatch(/do not retry/i)
  })

  it('passes a policy refusal through with its numbers', async () => {
    const err = Object.assign(new Error('refused'), {
      code: 'daily_cap_exceeded', mayHaveSettled: false, spent: 900_000n, cap: 1_000_000n,
    })
    const deps = { config, quote: vi.fn(), payForResource: vi.fn().mockRejectedValue(err) } as never
    const out = await fetchTool(deps, { url: URL_, max_amount: '1' })
    expect(out.error).toBe('daily_cap_exceeded')
    expect(out.may_have_settled).toBe(false)
    expect(out.remaining_today).toBe('0.100000')
  })

  // The draw landed on the daily cap even though the purchase never happened.
  // The generic "failed before any money moved" line is false here: money did
  // leave the contract, it is sitting in the operator wallet, and the
  // allowance that paid for it is gone until UTC midnight.
  it('does not say nothing moved when a draw was already sent', async () => {
    const deps = {
      config,
      quote: vi.fn(),
      payForResource: vi.fn().mockRejectedValue(Object.assign(
        new Error('drew 25000 but the operator balance has not reached 16753'),
        { code: 'draw_unconfirmed', mayHaveSettled: false, topUpTx: '0xtopup', toppedUp: 25_000n },
      )),
    } as never
    const out = await fetchTool(deps, { url: URL_, max_amount: '1' })
    expect(out.error).toBe('draw_unconfirmed')
    expect(out.may_have_settled).toBe(false)
    expect(out.top_up_transaction).toBe('0xtopup')
    expect(out.drawn_from_account).toBe('0.025000')
    expect(String(out.suggestion)).not.toMatch(/before any money moved/i)
    expect(String(out.suggestion)).toMatch(/allowance|daily/i)
  })

  // Left unset, `selectTerms` takes `accepts[0]` — the GATEWAY chooses which
  // token this wallet pays in. The contract still fails closed on a token it
  // has no policy for, so nothing leaks; but the agent is then told "the
  // account has no policy for this token, or the owner froze it", which is
  // not what happened. Naming the asset up front turns that into a refusal
  // that says what the gateway offered.
  it('tells the gateway which token this wallet can pay in, when quoting', async () => {
    const deps = {
      config,
      quote: vi.fn().mockResolvedValue({
        terms: { maxAmountRequired: 16753n, asset: config.token, description: 'e2-micro VM' },
        x402Version: 1,
      }),
      payForResource: vi.fn(),
    }
    await fetchTool(deps as never, { url: URL_, max_amount: '1', quote_only: true })
    expect(deps.quote).toHaveBeenCalledWith(
      expect.objectContaining({ preferAsset: config.token }),
    )
  })

  it('tells the gateway which token this wallet can pay in, when buying', async () => {
    const deps = {
      config,
      quote: vi.fn(),
      payForResource: vi.fn().mockResolvedValue({
        paid: 16753n, toppedUp: 0n,
        result: { status: 200, body: { ok: 1 } },
      }),
    }
    await fetchTool(deps as never, { url: URL_, max_amount: '1' })
    expect(deps.payForResource).toHaveBeenCalledWith(
      expect.objectContaining({ preferAsset: config.token }),
    )
  })
})
