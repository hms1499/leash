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

/**
 * A LeashClient stand-in that models the one thing that matters here: the
 * operator's balance rises only once a draw has actually landed.
 *
 * `drawLands: false` is the case this file could not express before — the
 * draw is sent, the hash comes back, and the money is not there yet. That is
 * the normal state of affairs for the first second or two of every draw.
 */
function fakeLeash(opts: { balance: bigint; preCheck?: unknown; drawLands?: boolean }) {
  let held = opts.balance
  return {
    operatorBalance: vi.fn().mockImplementation(async () => held),
    preCheckTopUp: vi.fn().mockResolvedValue(opts.preCheck ?? { ok: true }),
    topUp: vi.fn().mockImplementation(async (_token: unknown, amount: bigint) => {
      if (opts.drawLands !== false) held += amount
      return '0xtopup'
    }),
  } as never
}

/** Poll fast; the waiting itself is not what these tests are about. */
const NOW = { attempts: 3, intervalMs: 0 }

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

  it('draws the shortfall through the contract, not the whole price', async () => {
    const leash = fakeLeash({ balance: 6_753n })
    const out = await payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, gasBuffer: 0n, fetchImpl: okFetch() as never,
    })
    // 16753 - 6753, with the gas buffer switched off to isolate the shortfall.
    expect(out.toppedUp).toBe(10_000n)
    expect(out.topUpTx).toBe('0xtopup')
  })

  // The draw pays its own gas out of the balance it just topped up. Drawing the
  // bare shortfall lands the operator on exactly `price`, gas then takes it
  // below, and the EIP-3009 authorization it already signed for `price` fails
  // for insufficient balance. The buffer is what keeps the settlement solvent.
  it('draws more than the shortfall, so gas cannot leave it short of the price', async () => {
    const leash = fakeLeash({ balance: 6_753n })
    const out = await payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, fetchImpl: okFetch() as never,
    })
    expect(out.toppedUp).toBeGreaterThan(10_000n)
    // What lands in the operator wallet must clear the price with room to spare.
    expect(6_753n + out.toppedUp).toBeGreaterThan(16_753n)
  })

  it('does not add a gas buffer when no draw is needed', async () => {
    const leash = fakeLeash({ balance: 1_000_000n })
    const out = await payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, fetchImpl: okFetch() as never,
    })
    expect(out.toppedUp).toBe(0n)
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

  // The draw returns a hash, not money. Signing the EIP-3009 authorization
  // before the operator actually holds the price produces a signature the
  // facilitator cannot settle — and the agent sees the gateway refuse, as
  // though the gateway were at fault.
  it('waits for the drawn money to arrive before signing anything', async () => {
    const leash = fakeLeash({ balance: 6_753n })
    const fetchImpl = okFetch()
    const out = await payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, drawWait: NOW, fetchImpl: fetchImpl as never,
    })
    expect(out.result.settlement?.transaction).toBe('0xpaid')
    // Read once to size the draw, and again to see it land.
    const balance = (leash as never as { operatorBalance: ReturnType<typeof vi.fn> }).operatorBalance
    expect(balance.mock.calls.length).toBeGreaterThan(1)
  })

  // The whole point of failing here rather than one step later: nothing has
  // been signed, so nothing can settle. `mayHaveSettled` is false as a fact,
  // not as a guess.
  it('never signs a payment when the drawn money does not arrive', async () => {
    const leash = fakeLeash({ balance: 6_753n, drawLands: false })
    const fetchImpl = okFetch()
    await expect(payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, drawWait: NOW, fetchImpl: fetchImpl as never,
    })).rejects.toMatchObject({ code: 'draw_unconfirmed', mayHaveSettled: false })
    // Only the free quote. The paid request was never made.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  // The draw may still land a second later. Its hash is the only way a caller
  // can find out, and the daily cap has already been charged for it.
  it('reports the draw that was sent, so the spent allowance can be traced', async () => {
    const leash = fakeLeash({ balance: 6_753n, drawLands: false })
    await expect(payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, drawWait: NOW, fetchImpl: okFetch() as never,
    })).rejects.toMatchObject({ code: 'draw_unconfirmed', topUpTx: '0xtopup' })
  })

  // The price is 16753. An operator holding exactly that can afford the
  // purchase and nothing else: the settlement takes all of it, and a wallet
  // holding 0 stablecoin and 0 CELO cannot send any transaction at all —
  // including the topUpOperator that would refill it. It strands until the
  // owner sweeps to it.
  it('draws when paying would leave the operator unable to transact again', async () => {
    const leash = fakeLeash({ balance: 16_753n })
    const out = await payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, drawWait: NOW, fetchImpl: okFetch() as never,
    })
    expect(out.toppedUp).toBeGreaterThan(0n)
    // What survives the purchase has to clear the floor below which the
    // wallet cannot send anything.
    expect(16_753n + out.toppedUp - 16_753n).toBeGreaterThan(6_700n)
  })

  // The float is a nicety; the purchase is the job. Refusing to buy something
  // the wallet can already afford, because the policy will not fund a float
  // on top, blocks a legitimate payment over a future inconvenience the owner
  // can fix with sweep.
  it('still buys what it can afford when the policy will not fund the float', async () => {
    const leash = fakeLeash({
      balance: 16_753n,
      preCheck: { ok: false, error: 'daily_cap_exceeded', spent: 1_000_000n, cap: 1_000_000n },
    })
    const out = await payForResource({
      leash, account, url: URL_, body: BODY, feeBalances: fees,
      maxAmount: 20_000n, drawWait: NOW, fetchImpl: okFetch() as never,
    })
    expect(out.toppedUp).toBe(0n)
    expect(out.topUpTx).toBeUndefined()
    expect(out.result.settlement?.transaction).toBe('0xpaid')
    expect((leash as never as { topUp: ReturnType<typeof vi.fn> }).topUp).not.toHaveBeenCalled()
  })
})
