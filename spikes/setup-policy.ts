// One-time on-chain setup before the Task 14 gate test can pass.
//
// Two things are missing after a bare deploy: the contract has no policy for
// any token (every operator path reverts TokenNotConfigured), and it holds no
// funds (the money is still in the operator's own EOA). Both are fixed here.
//
// Safe to re-run: each step reads the chain first and skips what is already done.
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
const OWNER_PK = required('OWNER_PK') as `0x${string}`
const OPERATOR_PK = required('OPERATOR_PK') as `0x${string}`
const RPC = process.env.CELO_RPC_URL ?? 'https://forno.celo.org'

// USDC has 6 decimals. Per-tx 0.50, daily 1.00 — small enough that a rehearsal
// costs nothing, and shaped so the DAILY cap is what a demo runs into: two
// spends of 0.40 fit, a third does not.
const PER_TX = 500_000n
const DAILY = 1_000_000n
const FUND = 1_500_000n // 1.50 USDC moved into the contract

const owner = privateKeyToAccount(OWNER_PK)
const operator = privateKeyToAccount(OPERATOR_PK)
const pub = createPublicClient({ chain: celo, transport: http(RPC) })
const ownerWallet = createWalletClient({ account: owner, chain: celo, transport: http(RPC) })
const operatorWallet = createWalletClient({ account: operator, chain: celo, transport: http(RPC) })

const policyAbi = parseAbi([
  'function setPolicy(address token, uint256 perTx, uint256 daily)',
  'function limits(address) view returns (uint256 perTx, uint256 daily, uint256 spentToday, uint64 day)',
  'function remainingToday(address token) view returns (uint256)',
])
const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

// forno rejects sends non-deterministically (see T0.1 in spikes/README.md).
// The rejection lands in gas estimation, before signing, so retrying is safe —
// but only while that holds, so the nonce is re-read before every retry.
async function sendWithRetry(
  wallet: typeof ownerWallet | typeof operatorWallet,
  address: `0x${string}`,
  tx: Record<string, unknown>,
  label: string,
  tries = 6,
): Promise<`0x${string}`> {
  const nonceBefore = await pub.getTransactionCount({ address })
  for (let attempt = 1; ; attempt++) {
    try {
      return await (wallet as any).writeContract(tx)
    } catch (err) {
      const nonceNow = await pub.getTransactionCount({ address })
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

console.log('contract :', ACCOUNT)
console.log('token    :', TOKEN)
console.log('')

console.log('==> 1/2 policy')
const [perTx, daily] = await pub.readContract({
  address: ACCOUNT, abi: policyAbi, functionName: 'limits', args: [TOKEN],
})
if (perTx === PER_TX && daily === DAILY) {
  console.log(`    already set: perTx ${formatUnits(perTx, 6)}, daily ${formatUnits(daily, 6)} - skipping`)
} else {
  console.log(`    setting perTx ${formatUnits(PER_TX, 6)}, daily ${formatUnits(DAILY, 6)} USDC (owner pays gas in CELO)`)
  const hash = await sendWithRetry(ownerWallet, owner.address, {
    address: ACCOUNT, abi: policyAbi, functionName: 'setPolicy',
    args: [TOKEN, PER_TX, DAILY], account: owner, chain: celo,
  }, 'setPolicy')
  console.log('    tx:', hash)
  const r = await pub.waitForTransactionReceipt({ hash })
  console.log('    status:', r.status)
  if (r.status !== 'success') throw new Error('setPolicy reverted')
}

console.log('')
console.log('==> 2/2 funding the contract')
let held = await pub.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [ACCOUNT] })
if (held >= FUND) {
  console.log(`    contract already holds ${formatUnits(held, 6)} USDC - skipping`)
} else {
  const move = FUND - held
  const opHas = await pub.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [operator.address] })
  console.log(`    operator holds ${formatUnits(opHas, 6)} USDC, moving ${formatUnits(move, 6)} (gas paid in USDC)`)
  if (opHas < move) throw new Error(`operator holds ${formatUnits(opHas, 6)} USDC, needs ${formatUnits(move, 6)}`)
  const hash = await sendWithRetry(operatorWallet, operator.address, {
    address: TOKEN, abi: erc20, functionName: 'transfer',
    args: [ACCOUNT, move], account: operator, chain: celo, feeCurrency: ADAPTER,
  }, 'fund')
  console.log('    tx:', hash)
  const r = await pub.waitForTransactionReceipt({ hash })
  console.log('    status:', r.status)
  if (r.status !== 'success') throw new Error('funding reverted')
  held = await pub.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [ACCOUNT] })
}

console.log('')
console.log('==> result')
console.log('    contract USDC   :', formatUnits(held, 6))
console.log('    operator USDC   :', formatUnits(await pub.readContract({ address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [operator.address] }), 6))
console.log('    operator CELO   :', await pub.getBalance({ address: operator.address }))
console.log('    remainingToday  :', formatUnits(await pub.readContract({ address: ACCOUNT, abi: policyAbi, functionName: 'remainingToday', args: [TOKEN] }), 6), 'USDC')
console.log('')
console.log('SETUP OK - now run:  pnpm -F @leash/sdk test:gate')
