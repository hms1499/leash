import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { quote, payAndFetch, X402PaymentError } from '../../src/x402/fetch.js'

const raw = JSON.parse(
  readFileSync(new URL('../fixtures/challenge-usebuy.json', import.meta.url), 'utf8'),
)
const account = privateKeyToAccount(generatePrivateKey())
const URL_ = 'https://usebuy.ai/gcloud/vm'
const BODY = '{"script":"uname -a; nproc","machineType":"e2-micro"}'

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', ...headers },
  })

describe('quote', () => {
  it('reads the price without paying anything', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(402, raw))
    const q = await quote({ url: URL_, body: BODY, fetchImpl: fetchImpl as never })
    expect(q.terms.maxAmountRequired).toBe(16753n)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    // The whole point of quoting is that no X-PAYMENT is attached.
    const sent = fetchImpl.mock.calls[0][1] as RequestInit
    expect((sent.headers as Record<string, string>)['X-PAYMENT']).toBeUndefined()
  })

  it('reports a resource that is not actually paywalled', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { ok: true }))
    // Asserted on `code`, not the message: the code is the error's identity and
    // is what the MCP layer surfaces as structured JSON, while the message is
    // human prose that may be reworded.
    await expect(quote({ url: URL_, body: BODY, fetchImpl: fetchImpl as never }))
      .rejects.toMatchObject({ code: 'not_paywalled' })
  })
})

describe('payAndFetch', () => {
  it('attaches the payment and returns the decoded settlement', async () => {
    const settlement = { success: true, network: 'celo', payer: account.address, transaction: '0xabc' }
    const fetchImpl = vi.fn().mockResolvedValue(
      res(200, { instance: 'vm-1' }, {
        'x-payment-response': Buffer.from(JSON.stringify(settlement)).toString('base64'),
      }),
    )
    const q = await quote({
      url: URL_, body: BODY,
      fetchImpl: vi.fn().mockResolvedValue(res(402, raw)) as never,
    })
    const out = await payAndFetch({ url: URL_, body: BODY, account, quote: q, fetchImpl: fetchImpl as never })

    expect(out.status).toBe(200)
    expect(out.settlement?.success).toBe(true)
    expect(out.settlement?.transaction).toBe('0xabc')
    const sent = fetchImpl.mock.calls[0][1] as RequestInit
    expect((sent.headers as Record<string, string>)['X-PAYMENT']).toBeTruthy()
  })

  // A 5xx after the payment left is the dangerous case: the money may be gone
  // and the caller cannot tell. It must be flagged, not thrown like any other.
  it('flags a 5xx as possibly already settled', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(502, { error: 'upstream' }))
    const q = await quote({
      url: URL_, body: BODY,
      fetchImpl: vi.fn().mockResolvedValue(res(402, raw)) as never,
    })
    await expect(payAndFetch({ url: URL_, body: BODY, account, quote: q, fetchImpl: fetchImpl as never }))
      .rejects.toMatchObject({ code: 'gateway_error', mayHaveSettled: true })
  })

  // A 4xx refusal happens before settlement, so the caller can safely act on it.
  it('does not flag a 4xx refusal as settled', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(400, { error: 'bad body' }))
    const q = await quote({
      url: URL_, body: BODY,
      fetchImpl: vi.fn().mockResolvedValue(res(402, raw)) as never,
    })
    await expect(payAndFetch({ url: URL_, body: BODY, account, quote: q, fetchImpl: fetchImpl as never }))
      .rejects.toMatchObject({ mayHaveSettled: false })
  })

  // A 5xx cannot be retried, so the body is the only evidence left for working
  // out whether the fault was ours or the gateway's.
  it('keeps the gateway response body on a 5xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(500, { error: 'no capacity' }))
    const q = await quote({
      url: URL_, body: BODY,
      fetchImpl: vi.fn().mockResolvedValue(res(402, raw)) as never,
    })
    await expect(payAndFetch({ url: URL_, body: BODY, account, quote: q, fetchImpl: fetchImpl as never }))
      .rejects.toMatchObject({ body: { error: 'no capacity' } })
  })

  it('sends exactly one paid request, whatever happens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(502, {}))
    const q = await quote({
      url: URL_, body: BODY,
      fetchImpl: vi.fn().mockResolvedValue(res(402, raw)) as never,
    })
    await expect(payAndFetch({ url: URL_, body: BODY, account, quote: q, fetchImpl: fetchImpl as never }))
      .rejects.toThrow(X402PaymentError)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
