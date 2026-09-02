import { describe, it, expect } from 'vitest'
import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyTx } from '@celo/attribution-tags'
import { LeashClient } from '../src/index.js'

const {
  LEASH_ACCOUNT, ATTRIBUTION_TAG, OPERATOR_PK,
  SPEND_TOKEN, SPEND_PAYEE, FEE_ADAPTER,
} = process.env

const ready = Boolean(
  LEASH_ACCOUNT && ATTRIBUTION_TAG && OPERATOR_PK &&
  SPEND_TOKEN && SPEND_PAYEE && FEE_ADAPTER,
)

describe.runIf(ready)('mainnet attribution gate', () => {
  it('sends a real spend whose tag verifyTx can read back', async () => {
    const account = privateKeyToAccount(OPERATOR_PK as `0x${string}`)
    const pub = createPublicClient({ chain: celo, transport: http() })

    const leash = new LeashClient({
      account,
      accountAddress: LEASH_ACCOUNT as `0x${string}`,
      attributionTag: ATTRIBUTION_TAG!,
    })

    const token = SPEND_TOKEN as `0x${string}`
    const payee = SPEND_PAYEE as `0x${string}`

    const check = await leash.preCheck(token, payee, 1n)
    expect(check).toEqual({ ok: true })

    const feeBalances = new Map([[FEE_ADAPTER as `0x${string}`, 1_000_000n]])

    // forno rejects fee-currency sends non-deterministically: backends
    // disagree about the fee-currency gas price, so the same transaction is
    // refused by one node and accepted by the next (see T0.1 in
    // spikes/README.md). The rejection happens during gas estimation, before
    // anything is signed, so retrying is safe -- but only while that holds, so
    // the nonce is re-read and a retry is refused if it ever moved.
    const nonceBefore = await pub.getTransactionCount({ address: account.address })
    let hash: `0x${string}` | undefined
    for (let attempt = 1; attempt <= 5 && !hash; attempt++) {
      try {
        hash = await leash.spend(token, payee, 1n, feeBalances)
      } catch (err) {
        const nonceNow = await pub.getTransactionCount({ address: account.address })
        expect(nonceNow, 'a failed attempt moved the nonce; something broadcast')
          .toBe(nonceBefore)
        if (attempt === 5) throw err
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    const receipt = await pub.waitForTransactionReceipt({ hash: hash! })
    expect(receipt.status).toBe('success')

    const attribution = await verifyTx({ client: pub, hash: hash! })
    expect(attribution?.codes).toContain(ATTRIBUTION_TAG)

    // The claim is not just "a tagged spend happened" but "a tagged spend
    // happened from a wallet with no CELO". Assert it rather than trust it.
    const celoBalance = await pub.getBalance({ address: account.address })
    expect(celoBalance, 'operator must hold zero CELO').toBe(0n)

    console.log('proof tx:', `https://celoscan.io/tx/${hash}`)
    console.log('verifyTx codes:', attribution?.codes)
  }, 180_000)
})
