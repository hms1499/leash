import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { payForResource } from '../../src/x402/index.js'

const raw = JSON.parse(
  readFileSync(new URL('../fixtures/challenge-usebuy.json', import.meta.url), 'utf8'),
)
const account = privateKeyToAccount(generatePrivateKey())
const ADAPTER = '0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B' as const
const fees = new Map([[ADAPTER, 1_000_000n]])
const URL_ = 'https://usebuy.ai/gcloud/vm'
const BODY = '{"script":"uname -a","machineType":"e2-micro"}'

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', ...headers },
  })

/** A LeashClient stand-in. Only the four members payForResource touches. */
function fakeLeash(opts: { balance: bigint; preCheck?: unknown }) {
  return {
    operatorBalance: vi.fn().mockResolvedValue(opts.balance),
    preCheckTopUp: vi.fn().mockResolvedValue(opts.preCheck ?? { ok: true }),
    topUp: vi.fn().mockResolvedValue('0xtopup'),
  } as never
}

const okFetch = () => {
  const settlement = { success: true, network: 'celo', payer: account.address, transaction: '0xpaid' }
  return vi.fn()
    .mockResolvedValueOnce(res(402, raw))
    .mockResolvedValueOnce(res(200, { instance: 'vm-1' }, {
      'x-payment-response': Buffer.from(JSON.stringify(settlement)).toString('base64'),
    }))
}

describe('payForResource', () => {
  it('does not touch the contract when the operator already holds enough', async () => {
    const leash = fakeLeash({ balance: 1_000_000n })
    const out = await payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, fetchImpl: okFetch() as never,
    })
    expect(out.toppedUp).toBe(0n)
    expect((leash as never as { topUp: ReturnType<typeof vi.fn> }).topUp).not.toHaveBeenCalled()
    expect(out.result.settlement?.transaction).toBe('0xpaid')
  })

  it('draws exactly the shortfall through the contract, not the whole price', async () => {
    const leash = fakeLeash({ balance: 6_753n })
    const out = await payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, fetchImpl: okFetch() as never,
    })
    expect(out.toppedUp).toBe(10_000n)
    expect(out.topUpTx).toBe('0xtopup')
  })

  // The caller's cap is checked against the quote before any money moves.
  it('refuses a price above the caller maxAmount without drawing anything', async () => {
    const leash = fakeLeash({ balance: 0n })
    const fetchImpl = vi.fn().mockResolvedValue(res(402, raw))
    await expect(payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 1_000n, fetchImpl: fetchImpl as never,
    })).rejects.toMatchObject({ code: 'price_above_max' })
    expect((leash as never as { topUp: ReturnType<typeof vi.fn> }).topUp).not.toHaveBeenCalled()
  })

  // The policy refusal must surface as itself, not as a failed transaction.
  it('surfaces a policy refusal before spending gas on it', async () => {
    const leash = fakeLeash({
      balance: 0n,
      preCheck: { ok: false, error: 'daily_cap_exceeded', spent: 990_000n, cap: 1_000_000n },
    })
    const fetchImpl = vi.fn().mockResolvedValue(res(402, raw))
    await expect(payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, fetchImpl: fetchImpl as never,
    })).rejects.toMatchObject({ code: 'daily_cap_exceeded' })
    expect((leash as never as { topUp: ReturnType<typeof vi.fn> }).topUp).not.toHaveBeenCalled()
  })
})
