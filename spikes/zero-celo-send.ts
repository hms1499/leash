// T0.1 — can a wallet holding ZERO CELO send a transaction, paying gas in a
// stablecoin? Proving it needs a wallet that actually holds zero, so this
// sweeps the operator's remaining CELO out first (paying that sweep's gas in
// the stablecoin too, which is the only way to reach exactly zero) and then
// sends a tagged transaction from the emptied wallet.
import { toDataSuffix, verifyTx } from '@celo/attribution-tags'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`set ${name}`)
  return v
}
const TAG = required('ATTRIBUTION_TAG')
const PK = required('OPERATOR_PK') as `0x${string}`
const SWEEP_TO = required('OWNER') as `0x${string}`
const ADAPTER = required('FEE_ADAPTER') as `0x${string}`
const RPC = process.env.CELO_RPC_URL ?? 'https://forno.celo.org'

const account = privateKeyToAccount(PK)
const pub = createPublicClient({ chain: celo, transport: http(RPC) })
const wallet = createWalletClient({ account, chain: celo, transport: http(RPC) })
const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)'])

const feeBalance = () => pub.readContract({
  address: ADAPTER, abi: erc20, functionName: 'balanceOf', args: [account.address],
})

// A receipt does not mean the new balance is visible: forno is load-balanced
// and the node answering the next read may not have applied the block yet.
// Wait on the condition, never on the receipt.
async function waitForBalance(want: bigint, tries = 30): Promise<bigint> {
  let bal = await pub.getBalance({ address: account.address })
  for (let i = 0; i < tries && bal !== want; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    bal = await pub.getBalance({ address: account.address })
  }
  return bal
}


// forno is load-balanced and its backends disagree about the fee-currency gas
// price: the same maxFeePerGas is rejected by one node with "max fee per gas
// less than block base fee" and accepted by the next, and consecutive reads of
// eth_gasPrice differ. Measured, not assumed — one value failed twice then
// succeeded unchanged, and a higher value failed before succeeding twice.
//
// These failures happen inside gas estimation, before anything is signed or
// broadcast, so retrying is safe. It is only safe while that stays true, so
// every retry re-reads the nonce first and refuses to send again if it moved.
async function sendWithRetry(
  tx: Parameters<typeof wallet.sendTransaction>[0],
  label: string,
  tries = 8,
): Promise<`0x${string}`> {
  const nonceBefore = await pub.getTransactionCount({ address: account.address })
  for (let attempt = 1; ; attempt++) {
    try {
      return await wallet.sendTransaction(tx)
    } catch (err) {
      const nonceNow = await pub.getTransactionCount({ address: account.address })
      if (nonceNow !== nonceBefore) {
        throw new Error(
          `${label}: attempt ${attempt} reported failure but the nonce moved ` +
            `${nonceBefore} -> ${nonceNow}. Something was broadcast; refusing to retry.`,
        )
      }
      if (attempt >= tries) throw err
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err)
      console.log(`    attempt ${attempt} failed (${msg.slice(0, 60)}), retrying`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

console.log('operator      :', account.address)
let celoBalance = await pub.getBalance({ address: account.address })
const feeBefore = await feeBalance()
console.log('CELO before   :', celoBalance)
console.log('fee ccy before:', feeBefore)

if (celoBalance > 0n) {
  console.log('')
  console.log(`==> sweeping ${celoBalance} wei of CELO to ${SWEEP_TO}, gas paid in the fee currency`)
  const sweep = await sendWithRetry(
    { to: SWEEP_TO, value: celoBalance, feeCurrency: ADAPTER },
    'sweep',
  )
  console.log('    tx:', sweep)
  const r = await pub.waitForTransactionReceipt({ hash: sweep })
  console.log('    status:', r.status, 'gasUsed', r.gasUsed)
  if (r.status !== 'success') throw new Error('sweep reverted')
  celoBalance = await waitForBalance(0n)
  console.log('    CELO after sweep:', celoBalance)
}

if (celoBalance !== 0n) {
  throw new Error(`operator still holds ${celoBalance} wei of CELO — cannot prove the zero-CELO claim`)
}

console.log('')
console.log('==> sending a tagged transaction from a wallet holding ZERO CELO')
const suffix = toDataSuffix(TAG)
const hash = await sendWithRetry(
  { to: account.address, value: 0n, data: suffix, feeCurrency: ADAPTER },
  'tagged send',
)
console.log('    tx:', hash)
const receipt = await pub.waitForTransactionReceipt({ hash })
console.log('    status:', receipt.status, 'gasUsed', receipt.gasUsed)
if (receipt.status !== 'success') throw new Error('transaction reverted')

const decoded = await verifyTx({ client: pub, hash })
console.log('    verifyTx:', JSON.stringify(decoded))
if (!decoded?.codes.includes(TAG)) throw new Error(`tag ${TAG} not found`)

const celoAfter = await pub.getBalance({ address: account.address })
const feeAfter = await feeBalance()
console.log('')
console.log('CELO after    :', celoAfter, celoAfter === 0n ? '(still zero)' : '(NOT ZERO)')
console.log('fee ccy after :', feeAfter, `(spent ${feeBefore - feeAfter})`)
if (celoAfter !== 0n) throw new Error('CELO balance is not zero after the send')

console.log('')
console.log('ZERO-CELO SEND OK')
console.log(`proof: https://celoscan.io/tx/${hash}`)
