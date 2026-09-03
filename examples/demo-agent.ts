/**
 * The demo, and the thing another team copies.
 *
 * Three spends land, and the fourth is refused by the contract's policy —
 * not by this script, and not by a prompt. Deliberately no LLM in the loop:
 * a demo that needs a model to cooperate is a demo that cannot be reshot.
 *
 * It moves real money on Celo mainnet. Run it with:
 *   LEASH_DEMO_SPEND_REAL_MONEY=yes pnpm -F @leash/examples demo
 */
import { privateKeyToAccount } from 'viem/accounts'
import { LeashClient } from '@leash/sdk'

if (process.env.LEASH_DEMO_SPEND_REAL_MONEY !== 'yes') {
  console.error(
    'This script spends real USDC on Celo mainnet.\n' +
    'Re-run with LEASH_DEMO_SPEND_REAL_MONEY=yes if that is what you want.',
  )
  process.exit(1)
}

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

const account = privateKeyToAccount(required('OPERATOR_PK') as `0x${string}`)
const leash = new LeashClient({
  account,
  accountAddress: required('LEASH_ACCOUNT') as `0x${string}`,
  attributionTag: required('ATTRIBUTION_TAG'),
  rpcUrl: process.env.CELO_RPC_URL,
})

const token = required('SPEND_TOKEN') as `0x${string}`
const payee = required('SPEND_PAYEE') as `0x${string}`
const feeAdapter = required('FEE_ADAPTER') as `0x${string}`
const accountAddress = required('LEASH_ACCOUNT') as `0x${string}`

/**
 * The operator's real balance of the fee adapter.
 *
 * LeashClient has no feeBalances() of its own — callers build this map, the
 * same way mcp/src/index.ts does. It is read rather than assumed because
 * pickFeeAdapter throws when every adapter is empty, which is the honest
 * failure when the agent cannot pay for gas.
 */
async function feeBalances(): Promise<ReadonlyMap<`0x${string}`, bigint>> {
  return new Map([[feeAdapter, await leash.operatorBalance(feeAdapter)]])
}

const SMALL = 10_000n      // 0.01 USDC — comfortably inside both caps
const OVERSIZED = 900_000n // 0.90 USDC — above the 0.50 per-transaction cap

console.log('--- Leash demo ---')
console.log(`account  ${accountAddress}`)
console.log(`agent    ${account.address}`)

for (let i = 1; i <= 3; i++) {
  const check = await leash.preCheck(token, payee, SMALL)
  if (!check.ok) {
    console.log(`spend ${i}: refused before it started (${check.error})`)
    break
  }
  const hash = await leash.spend(token, payee, SMALL, await feeBalances())
  console.log(`spend ${i}: 0.01 USDC  https://celoscan.io/tx/${hash}`)
  console.log(`           remaining today: ${await leash.remainingToday(token)}`)
}

console.log('\nNow asking for more than the policy allows:')
const refused = await leash.preCheck(token, payee, OVERSIZED)
if (refused.ok) {
  console.error('The policy did NOT refuse an oversized spend. Check the caps.')
  process.exit(1)
}
console.log(JSON.stringify(refused, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
console.log(
  '\nThe contract refused it. Not the prompt, not this script — the contract.\n' +
  'Note that no transaction was sent: the refusal is a staticcall and costs no gas.',
)
