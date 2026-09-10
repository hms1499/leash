import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { quote, payAndFetch } from '../../src/x402/fetch.js'

const v2 = JSON.parse(
  readFileSync(new URL('../fixtures/challenge-agent402-v2.json', import.meta.url), 'utf8'),
)
const v1 = JSON.parse(
  readFileSync(new URL('../fixtures/challenge-usebuy.json', import.meta.url), 'utf8'),
)

const account = privateKeyToAccount(generatePrivateKey())
const URL_ = 'https://agent402.tools/api/tls-cert'
const BODY = '{"host":"usebuy.ai"}'
const CELO_USDC = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C'

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64')
const decode = (s: string) => JSON.parse(Buffer.from(s, 'base64').toString())

/** A v2 402: the challenge rides in the header and the body is empty. */
const challenge402 = () =>
  new Response('{}', {
    status: 402,
    headers: { 'content-type': 'application/json', 'PAYMENT-REQUIRED': b64(v2) },
  })

const headersOf = (call: unknown[]) =>
  (call[1] as RequestInit).headers as Record<string, string>

describe('quote against a v2 gateway', () => {
  // The v1 parser reads the body, and a v2 body is `{}`. Until the header is
  // read, every v2 endpoint answers `malformed_challenge` — which is what
  // agent402.tools does today against this client.
  it('reads the price from the PAYMENT-REQUIRED header, not the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(challenge402())

    const q = await quote({
      url: URL_, method: 'GET', preferAsset: CELO_USDC, fetchImpl: fetchImpl as never,
    })

    expect(q.x402Version).toBe(2)
    expect(q.terms.maxAmountRequired).toBe(1000n)
    expect(q.terms.asset).toBe(CELO_USDC)
  })
})

describe('payAndFetch against a v2 gateway', () => {
  const quoteV2 = () =>
    quote({ url: URL_, method: 'GET', preferAsset: CELO_USDC, fetchImpl: vi.fn().mockResolvedValue(challenge402()) as never })

  it('sends the payment in PAYMENT-SIGNATURE rather than X-PAYMENT', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await payAndFetch({ url: URL_, method: 'GET', body: BODY, account, quote: await quoteV2(), fetchImpl: fetchImpl as never })

    const h = headersOf(fetchImpl.mock.calls[0])
    expect(h['PAYMENT-SIGNATURE']).toBeTruthy()
    expect(h['X-PAYMENT']).toBeUndefined()
  })

  // v2 makes the client echo the chosen entry and the resource block back. A
  // payload missing either is rejected by the facilitator after signing — the
  // expensive place to find out.
  it('echoes the accepted entry and resource block in the payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))

    await payAndFetch({ url: URL_, method: 'GET', body: BODY, account, quote: await quoteV2(), fetchImpl: fetchImpl as never })

    const sent = decode(headersOf(fetchImpl.mock.calls[0])['PAYMENT-SIGNATURE'])
    expect(sent.x402Version).toBe(2)
    expect(sent.accepted).toMatchObject({ scheme: 'exact', network: 'eip155:42220', amount: '1000' })
    expect(sent.resource).toMatchObject({ url: URL_ })
    expect(sent.payload.authorization.value).toBe('1000')
    expect(sent.payload.signature).toMatch(/^0x/)
  })

  it('decodes the settlement from PAYMENT-RESPONSE', async () => {
    const settlement = { success: true, transaction: '0xabc', network: 'eip155:42220', payer: account.address }
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ host: 'usebuy.ai' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'PAYMENT-RESPONSE': b64(settlement) },
      }),
    )

    const out = await payAndFetch({ url: URL_, method: 'GET', body: BODY, account, quote: await quoteV2(), fetchImpl: fetchImpl as never })

    expect(out.settlement?.success).toBe(true)
    expect(out.settlement?.transaction).toBe('0xabc')
  })
})

// The v1 gateway is the one already being paid on mainnet. Adding v2 must not
// change a single byte of what it receives.
describe('v1 is unchanged by v2 support', () => {
  it('still sends X-PAYMENT and no PAYMENT-SIGNATURE', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const q = await quote({
      url: 'https://usebuy.ai/gcloud/vm',
      body: '{"machineType":"e2-micro"}',
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(v1), { status: 402, headers: { 'content-type': 'application/json' } }),
      ) as never,
    })

    await payAndFetch({ url: 'https://usebuy.ai/gcloud/vm', body: '{}', account, quote: q, fetchImpl: fetchImpl as never })

    const h = headersOf(fetchImpl.mock.calls[0])
    expect(h['X-PAYMENT']).toBeTruthy()
    expect(h['PAYMENT-SIGNATURE']).toBeUndefined()
    expect(decode(h['X-PAYMENT']).x402Version).toBe(1)
  })
})
