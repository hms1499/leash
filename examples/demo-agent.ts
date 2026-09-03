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
import { createPublicClient, http, isAddress, getAddress, formatUnits } from 'viem'
import { celo } from 'viem/chains'
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

/**
 * Validates and checksum-normalizes an address env var.
 *
 * Same routine as mcp/src/config.ts's requireAddress: fail loudly at
 * startup, naming the offending variable, rather than surfacing later as a
 * viem InvalidAddressError from inside some read. The checksum step also
 * matters for feeBalances() below: a lowercase address copied out of a
 * block explorer URL would otherwise silently fail to match the
 * checksummed literals pickFeeAdapter compares against, and the demo
 * would die with "no funded fee adapter" about a wallet that is fully
 * funded.
 */
function requiredAddress(name: string): `0x${string}` {
  const v = required(name)
  if (!isAddress(v)) throw new Error(`${name} is not a valid address: ${v}`)
  return getAddress(v)
}

const operatorPk = required('OPERATOR_PK')
if (!/^0x[0-9a-fA-F]{64}$/.test(operatorPk)) {
  throw new Error('OPERATOR_PK is not a 32-byte hex private key')
}
const attributionTag = required('ATTRIBUTION_TAG')
if (!/^celo_[0-9a-f]{12}$/.test(attributionTag)) {
  throw new Error(`ATTRIBUTION_TAG must look like celo_ plus 12 hex characters, got "${attributionTag}"`)
}

const accountAddress = requiredAddress('LEASH_ACCOUNT')
const account = privateKeyToAccount(operatorPk as `0x${string}`)
const leash = new LeashClient({
  account,
  accountAddress,
  attributionTag,
  rpcUrl: process.env.CELO_RPC_URL,
})

const token = requiredAddress('SPEND_TOKEN')
const payee = requiredAddress('SPEND_PAYEE')
const feeAdapter = requiredAddress('FEE_ADAPTER')

/**
 * Reads receipts so `remainingToday` (below) reflects a mined spend rather
 * than a broadcast one. Separate from the LeashClient's own wallet client:
 * this script only ever reads with it, never signs.
 */
const publicClient = createPublicClient({
  chain: celo, transport: http(process.env.CELO_RPC_URL),
})

/**
 * The operator's real balance of the fee adapter.
 *
 * LeashClient has no feeBalances() of its own — callers build this map,
 * keyed by the checksummed adapter address (see requiredAddress above),
 * the way mcp/src/config.ts + mcp/src/index.ts do it. It is read rather
 * than assumed because pickFeeAdapter throws when every adapter is empty,
 * which is the honest failure when the agent cannot pay for gas.
 */
async function feeBalances(): Promise<ReadonlyMap<`0x${string}`, bigint>> {
  return new Map([[feeAdapter, await leash.operatorBalance(feeAdapter)]])
}

const SMALL = 10_000n      // 0.01 USDC — comfortably inside both caps
const OVERSIZED = 900_000n // 0.90 USDC — above the 0.50 per-transaction cap

console.log('--- Leash demo ---')
console.log(`account  ${accountAddress}`)
console.log(`agent    ${account.address}`)

try {
  for (let i = 1; i <= 3; i++) {
    const check = await leash.preCheck(token, payee, SMALL)
    if (!check.ok) {
      console.log(`spend ${i}: refused before it started (${check.error})`)
      break
    }
    const hash = await leash.spend(token, payee, SMALL, await feeBalances())
    // spend() resolves once the transaction is broadcast, not once it is
    // mined — LeashClient sends with `sendTransaction`, not `writeContract`
    // + a receipt wait (sdk/src/policyClient.ts). Reading `remainingToday`
    // right after `spend()` would race the block that includes it, on
    // Celo's ~1s blocks almost certainly losing that race and printing a
    // stale allowance. Waiting for the receipt here also serializes the
    // three sends, which avoids three back-to-back broadcasts contending
    // for the same nonce against load-balanced forno.
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`spend ${i}: 0.01 USDC  https://celoscan.io/tx/${hash}`)
    const remaining = await leash.remainingToday(token)
    console.log(`           remaining today: ${formatUnits(remaining, 6)} USDC`)
  }
} catch (err) {
  // A network hiccup, an unfunded fee adapter, or a nonce race here must
  // not take down the process before the demo's cheapest and most
  // important beat: the refusal below needs no funded wallet and no
  // successful transaction, so it still runs even if every spend above
  // failed.
  console.log(
    `\nA spend failed before completing: ${err instanceof Error ? err.message : String(err)}`,
  )
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
