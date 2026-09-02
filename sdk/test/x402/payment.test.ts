import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { recoverTypedDataAddress, getAddress } from 'viem'
import { celo } from 'viem/chains'
import { parseChallenge, selectTerms } from '../../src/x402/challenge.js'
import { buildAuthorization, signPayment } from '../../src/x402/payment.js'

const raw = JSON.parse(
  readFileSync(new URL('../fixtures/challenge-usebuy.json', import.meta.url), 'utf8'),
)
const terms = selectTerms(parseChallenge(raw))
// A fresh key per run. Deliberately not a literal: a key committed to a repo
// is a key someone eventually pastes into production, and these tests only need
// *a* signer, not a particular one.
const account = privateKeyToAccount(generatePrivateKey())

describe('buildAuthorization', () => {
  it('authorises exactly the amount the gateway asked for, to the gateway', () => {
    const a = buildAuthorization({ from: account.address, terms, now: 1_800_000_000 })
    expect(a.value).toBe(16753n)
    expect(a.to).toBe(getAddress('0x20faAca5F980E29639A0FCC6dcA6988E18ed333B'))
    expect(a.from).toBe(getAddress(account.address))
  })

  // A validAfter of exactly now is rejected by a facilitator whose clock is a
  // second behind ours, and the payment is lost to a race we cannot see.
  it('backdates validAfter to absorb clock skew', () => {
    const a = buildAuthorization({ from: account.address, terms, now: 1_800_000_000 })
    expect(a.validAfter).toBeLessThan(1_800_000_000n)
  })

  it('expires no later than the gateway is willing to wait', () => {
    const a = buildAuthorization({ from: account.address, terms, now: 1_800_000_000 })
    expect(a.validBefore).toBe(BigInt(1_800_000_000 + terms.maxTimeoutSeconds))
  })

  // A reused nonce is a replay the token will reject, wasting the request.
  it('draws a fresh nonce each time', () => {
    const a = buildAuthorization({ from: account.address, terms })
    const b = buildAuthorization({ from: account.address, terms })
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.nonce).toMatch(/^0x[0-9a-f]{64}$/)
  })
})

describe('signPayment', () => {
  it('signs over the token domain the challenge published, so the token can verify it', async () => {
    const authorization = buildAuthorization({ from: account.address, terms })
    const header = await signPayment({ account, terms, authorization, x402Version: 1 })
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString())

    expect(decoded.x402Version).toBe(1)
    expect(decoded.scheme).toBe('exact')
    expect(decoded.network).toBe('celo')

    const signer = await recoverTypedDataAddress({
      domain: {
        name: terms.tokenName,
        version: terms.tokenVersion,
        chainId: celo.id,
        verifyingContract: terms.asset,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: authorization,
      signature: decoded.payload.signature,
    })
    expect(getAddress(signer)).toBe(getAddress(account.address))
  })

  // The wire format is JSON, which has no bigint. Sending numbers unstringified
  // throws at serialisation time; sending them lossily is worse.
  it('serialises every authorization field as a string', async () => {
    const authorization = buildAuthorization({ from: account.address, terms })
    const header = await signPayment({ account, terms, authorization, x402Version: 1 })
    const { authorization: a } = JSON.parse(Buffer.from(header, 'base64').toString()).payload
    for (const k of ['value', 'validAfter', 'validBefore']) {
      expect(typeof a[k]).toBe('string')
    }
    expect(a.value).toBe('16753')
  })
})
