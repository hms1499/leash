// One-off: move the operator's excess USDC back into the contract so the Task 9
// gate is forced to draw through topUpOperator instead of passing on leftovers.
//
// Leaves the operator with TARGET_AFTER, which must satisfy two bounds:
//   < price (16753)  so a draw actually happens
//   > ~7000          so the draw's own gas RESERVE (gasLimit * maxFeePerGas,
//                    about 3x the real cost) is coverable at send time
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`set ${name}`)
  return v
}
const ACCOUNT = required('LEASH_ACCOUNT') as `0x${string}`
const TOKEN = required('SPEND_TOKEN') as `0x${string}`
const ADAPTER = required('FEE_ADAPTER') as `0x${string}`
const OPERATOR_PK = required('OPERATOR_PK') as `0x${string}`
const RPC = process.env.CELO_RPC_URL ?? 'https://forno.celo.org'

const TARGET_AFTER = 15_000n // pre-gas; ~12.7k survives the transfer's own gas
const PRICE = 16_753n

const operator = privateKeyToAccount(OPERATOR_PK)
const pub = createPublicClient({ chain: celo, transport: http(RPC) })
const wallet = createWalletClient({ account: operator, chain: celo, transport: http(RPC) })
const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

async function sendWithRetry(tx: Record<string, unknown>, label: string, tries = 6): Promise<`0x${string}`> {
  const nonceBefore = await pub.getTransactionCount({ address: operator.address })
  for (let attempt = 1; ; attempt++) {
    try {
      return await (wallet as any).writeContract(tx)
    } catch (err) {
      const nonceNow = await pub.getTransactionCount({ address: operator.address })
      if (nonceNow !== nonceBefore) {
        throw new Error(`${label}: attempt ${attempt} failed but the nonce moved ${nonceBefore} -> ${nonceNow}; refusing to retry`)
      }
      if (attempt >= tries) throw err
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err)
      console.log(`    attempt ${attempt} failed (${msg.slice(0, 70)}), retrying`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
}

const bal = (who: `0x${string}`) =>
  pub.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [who] })

const opHas = await bal(operator.address)
console.log('operator USDC before:', formatUnits(opHas, 6))

if (opHas < PRICE) {
  console.log(`already below the price (${formatUnits(PRICE, 6)}) - nothing to do`)
  process.exit(0)
}
const move = opHas - TARGET_AFTER
console.log('moving to contract  :', formatUnits(move, 6))

const hash = await sendWithRetry({
  address: TOKEN, abi: erc20, functionName: 'transfer',
  args: [ACCOUNT, move], account: operator, chain: celo, feeCurrency: ADAPTER,
  gas: 300_000n, // see GAS_LIMIT in sdk/src/policyClient.ts — without this the
                 // node reserves blockGasLimit * gasPrice (0.465 USDC) instead.
}, 'drain')
console.log('tx:', hash)
const r = await pub.waitForTransactionReceipt({ hash })
console.log('status:', r.status)
if (r.status !== 'success') throw new Error('drain reverted')

// Wait on the condition, never on the receipt: forno is load-balanced and a
// receipt does not mean the new balance is readable yet (T0.1).
let after = await bal(operator.address)
for (let i = 0; i < 20 && after >= opHas; i++) {
  await new Promise((res) => setTimeout(res, 2000))
  after = await bal(operator.address)
}
console.log('')
console.log('operator USDC after :', formatUnits(after, 6), after < PRICE ? '✓ below price' : '✗ STILL ABOVE PRICE')
console.log('contract USDC after :', formatUnits(await bal(ACCOUNT), 6))
console.log('operator CELO       :', await pub.getBalance({ address: operator.address }))
