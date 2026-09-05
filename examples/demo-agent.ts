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
 * Reads receipts, so a spend is known to have been mined — and to have
 * succeeded — before the demo says anything about it. Separate from the
 * LeashClient's own wallet client: this script only ever reads with it,
 * never signs.
 *
 * A receipt is where the allowance read USED to be taken from. It is not
 * enough on its own; see remainingAtMost below for what that cost.
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

/**
 * Re-reads the allowance until the chain actually shows it fall.
 *
 * The receipt waited for above proves the spend landed. It does NOT prove
 * that the next read reaches a node which has seen that block: forno is
 * load-balanced, and on the first real mainnet run (2026-09-05) it answered
 * 1, 1, 0.98 for three spends whose blocks held 0.99, 0.98, 0.97 — reads one
 * to two blocks behind, receipt in hand. On camera that turns this demo's
 * central claim, a counter falling by exactly what was spent, into a counter
 * that does not move.
 *
 * Same rule as the app's pollUntil (app/lib/confirm.ts), which `examples`
 * cannot import: wait on the condition and never on the receipt; swallow a
 * failed read, because one node refusing says nothing about the spend; and
 * return null for "not observed" rather than a number nobody verified.
 *
 * The ceiling is derived from the allowance read before the loop minus the
 * amounts deliberately spent since, not from a fresh read: a stale "before"
 * would be satisfied by an equally stale "after", and the lag would survive.
 *
 * The interval is 1s rather than confirm.ts's 3s. Celo produces a block a
 * second, and this runs between beats of a filmed demo, where a three-second
 * stall reads as a hang.
 */
async function remainingAtMost(ceiling: bigint): Promise<bigint | null> {
  for (let i = 0; i < 20; i++) {
    try {
      const remaining = await leash.remainingToday(token)
      if (remaining <= ceiling) return remaining
    } catch {
      // A single node refusing the read says nothing about the spend.
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return null
}

const SMALL = 10_000n      // 0.01 USDC — comfortably inside both caps
const OVERSIZED = 900_000n // 0.90 USDC — above the 0.50 per-transaction cap

console.log('--- Leash demo ---')
console.log(`account  ${accountAddress}`)
console.log(`agent    ${account.address}`)

try {
  // Read once, before anything is spent, so the ceilings below are anchored
  // to a figure no pending transaction can have made stale.
  const startRemaining = await leash.remainingToday(token)

  for (let i = 1; i <= 3; i++) {
    const check = await leash.preCheck(token, payee, SMALL)
    if (!check.ok) {
      console.log(`spend ${i}: refused before it started (${check.error})`)
      break
    }
    const hash = await leash.spend(token, payee, SMALL, await feeBalances())
    // spend() resolves once the transaction is broadcast, not once it is
    // mined — LeashClient sends with `sendTransaction`, not `writeContract`
    // + a receipt wait (sdk/src/policyClient.ts). Two things still need this
    // wait: the status check just below, which needs a receipt to exist at
    // all, and serializing the three sends, which keeps back-to-back
    // broadcasts from contending for the same nonce against load-balanced
    // forno.
    //
    // What it does NOT buy is a trustworthy read afterwards. This comment
    // used to claim the receipt was what kept the allowance figure honest;
    // the first real mainnet run disproved that. remainingAtMost carries the
    // measurement.
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    // A revert resolves this promise; it does not reject it. Without this
    // check a reverted spend (fee-adapter drained mid-loop, the contract
    // paused, a race with another caller) would still print as a landed
    // 0.01 USDC spend, with `remainingToday` then showing the same
    // (unchanged) figure as before it — the exact false-success-on-camera
    // this receipt wait exists to prevent, reached from the other side.
    if (receipt.status !== 'success') {
      throw new Error(`spend ${i} reverted on-chain: https://celoscan.io/tx/${hash}`)
    }
    console.log(`spend ${i}: 0.01 USDC  https://celoscan.io/tx/${hash}`)
    const remaining = await remainingAtMost(startRemaining - BigInt(i) * SMALL)
    // Say the honest thing rather than print a figure that was never observed
    // to fall — the same distinction pollUntil's callers draw between "we
    // stopped waiting" and "it failed".
    console.log(
      remaining === null
        ? '           remaining today: not readable yet — forno has not caught up'
        : `           remaining today: ${formatUnits(remaining, 6)} USDC`,
    )
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
