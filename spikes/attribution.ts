// T0.3 — does an attribution tag survive being written into a transaction and
// read back out of it? If it does not, every track scores zero.
//
// Gas: this spike pays in a stablecoin when the sending wallet holds one of the
// whitelisted fee-currency adapters, and in CELO otherwise. The stablecoin leg
// is T0.1's question, not this one; the tag round-trip is what is under test
// here, and it must not be blocked on funding a wallet with USDC.
import { toDataSuffix, fromDataSuffix, verifyTx } from '@celo/attribution-tags'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'
import { KNOWN_FEE_ADAPTERS } from '../sdk/src/constants.js'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`set ${name}`)
  return v
}

const TAG = required('ATTRIBUTION_TAG')
const PK = (process.env.SPIKE_PK ?? required('OPERATOR_PK')) as `0x${string}`
const RPC = process.env.CELO_RPC_URL ?? 'https://forno.celo.org'

// --- offline first: a suffix that does not decode locally will never decode
// --- on chain either, and finding that out costs nothing.
const suffix = toDataSuffix(TAG)
const offline = fromDataSuffix(suffix)
console.log('tag           :', TAG)
console.log('suffix        :', suffix)
console.log('offline decode:', JSON.stringify(offline))
if (!offline?.codes.includes(TAG)) {
  throw new Error(`offline decode does not contain ${TAG} — aborting before spending gas`)
}

const account = privateKeyToAccount(PK)
const pub = createPublicClient({ chain: celo, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: celo, transport: http(RPC) })
console.log('sender        :', account.address)

// --- pick a fee currency if one is funded.
//
// Balances are read from the ADAPTER, not from the underlying token. The
// adapter rescales to 18 decimals (measured: a holder of 58553610 units of
// 6-decimal USDC reads as 58553610e12 through adapter 0x2F25deB3), so reading
// the token directly would compare adapters on different scales.
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)'])
let feeCurrency: `0x${string}` | undefined
let best = 0n
for (const adapter of KNOWN_FEE_ADAPTERS) {
  let bal = 0n
  try {
    bal = await pub.readContract({ address: adapter, abi: erc20, functionName: 'balanceOf', args: [account.address] })
  } catch { continue } // not every adapter answers balanceOf
  if (bal > best) { best = bal; feeCurrency = adapter }
}

const celoBalance = await pub.getBalance({ address: account.address })
if (feeCurrency) {
  console.log('gas paid in   :', `${feeCurrency} (balance ${best})`)
} else {
  console.log('gas paid in   : CELO — no funded fee adapter found')
  console.log('                T0.1 (stablecoin gas from a zero-CELO wallet) stays UNPROVEN.')
  if (celoBalance === 0n) throw new Error('wallet holds neither CELO nor any fee currency')
}
console.log('CELO balance  :', celoBalance)

const hash = await wallet.sendTransaction({
  to: account.address,
  value: 0n,
  data: suffix,
  ...(feeCurrency ? { feeCurrency } : {}),
})
console.log('tx            :', hash)

const receipt = await pub.waitForTransactionReceipt({ hash })
console.log('status        :', receipt.status, 'gasUsed', receipt.gasUsed)
if (receipt.status !== 'success') throw new Error('transaction reverted')

// --- read it back off the chain, which is the actual question.
const result = await verifyTx({ client: pub, hash })
console.log('verifyTx      :', JSON.stringify(result))
if (!result?.codes.includes(TAG)) {
  throw new Error(`tag ${TAG} NOT found in ${JSON.stringify(result)}`)
}

console.log('')
console.log('ROUND TRIP OK')
console.log(`proof: https://celoscan.io/tx/${hash}`)
console.log(`gas paid in: ${feeCurrency ?? 'CELO'}`)
