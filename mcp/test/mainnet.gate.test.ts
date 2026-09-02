import { describe, it, expect } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { LeashClient, payForResource } from '@leash/sdk'

const {
  LEASH_ACCOUNT, ATTRIBUTION_TAG, OPERATOR_PK, SPEND_TOKEN, FEE_ADAPTER,
} = process.env
const ready = Boolean(LEASH_ACCOUNT && ATTRIBUTION_TAG && OPERATOR_PK && SPEND_TOKEN && FEE_ADAPTER)

describe.runIf(ready)('mainnet x402 gate', () => {
  it('buys real compute with money drawn through the policy', async () => {
    const account = privateKeyToAccount(OPERATOR_PK as `0x${string}`)
    const pub = createPublicClient({ chain: celo, transport: http() })
    const leash = new LeashClient({
      account,
      accountAddress: LEASH_ACCOUNT as `0x${string}`,
      attributionTag: ATTRIBUTION_TAG!,
    })

    // Drain the operator into the contract first, so the purchase is forced to
    // draw through topUpOperator. Otherwise this test passes on leftovers and
    // never exercises the policy at all.
    const before = await leash.operatorBalance(SPEND_TOKEN as `0x${string}`)

    const out = await payForResource({
      leash, account,
      url: 'https://usebuy.ai/gcloud/vm',
      body: JSON.stringify({ script: 'uname -a; nproc', machineType: 'e2-micro' }),
      feeBalances: new Map([[FEE_ADAPTER as `0x${string}`, 1n]]),
      maxAmount: 50_000n,
    })

    expect(out.result.status).toBe(200)
    expect(out.result.settlement?.success).toBe(true)
    expect(out.paid).toBeGreaterThan(0n)

    // The operator must still hold no CELO: gas for the top-up was paid in a
    // stablecoin, and the settlement's gas was the facilitator's to pay.
    expect(await pub.getBalance({ address: account.address })).toBe(0n)

    console.log('settlement:', `https://celoscan.io/tx/${out.result.settlement?.transaction}`)
    if (out.topUpTx) console.log('top-up   :', `https://celoscan.io/tx/${out.topUpTx}`)
    console.log('operator balance before:', before)
  }, 180_000)
})
