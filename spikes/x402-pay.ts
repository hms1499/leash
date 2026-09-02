// T3.0 — can we settle one real x402 payment on Celo mainnet from our own code,
// without the `buy` client, paying our own way?
//
// The standard x402 packages cannot: x402@1.2.0's SupportedEVMNetworks lists 15
// EVM chains and celo is not among them, so both its signer and its
// encodePayment reject network "celo" outright. This reimplements the exact
// scheme against the protocol as the library defines it.
//
// DRY_RUN=1 builds and prints the payment without sending it. That costs
// nothing and spends none of the 20 free mainnet settlements.
import { createPublicClient, http, getAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { celo } from 'viem/chains'

const OPERATOR_PK = process.env.OPERATOR_PK as `0x${string}`
if (!OPERATOR_PK) throw new Error('set OPERATOR_PK')
const DRY_RUN = process.env.DRY_RUN === '1'
const RESOURCE = process.env.X402_URL ?? 'https://usebuy.ai/gcloud/vm'
const BODY = process.env.X402_BODY ?? '{"script":"uname -a; nproc","machineType":"e2-micro"}'

const account = privateKeyToAccount(OPERATOR_PK)
const pub = createPublicClient({ chain: celo, transport: http() })

// --- 1. ask for the challenge. An unpaid POST returns 402 with the terms.
const challengeRes = await fetch(RESOURCE, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: BODY,
})
if (challengeRes.status !== 402) {
  throw new Error(`expected 402, got ${challengeRes.status}: ${(await challengeRes.text()).slice(0, 300)}`)
}
const challenge = await challengeRes.json() as {
  x402Version: number
  accepts: Array<{
    scheme: string; network: string; maxAmountRequired: string; payTo: `0x${string}`
    asset: `0x${string}`; maxTimeoutSeconds: number
    extra?: { name?: string; version?: string }
  }>
}

const terms = challenge.accepts.find((a) => a.extra?.name === 'USDC') ?? challenge.accepts[0]
console.log('challenge  : x402Version', challenge.x402Version, '| scheme', terms.scheme, '| network', terms.network)
console.log('asset      :', terms.asset, `(${terms.extra?.name} v${terms.extra?.version})`)
console.log('payTo      :', terms.payTo)
console.log('amount     :', terms.maxAmountRequired, 'atomic =', Number(terms.maxAmountRequired) / 1e6, 'USDC')

// --- 2. can we even pay it?
const balance = await pub.readContract({
  address: terms.asset,
  abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view',
          inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }] as const,
  functionName: 'balanceOf', args: [account.address],
})
console.log('payer      :', account.address, '| holds', Number(balance) / 1e6, terms.extra?.name)
if (balance < BigInt(terms.maxAmountRequired)) {
  throw new Error(`payer holds ${balance}, needs ${terms.maxAmountRequired}`)
}

// --- 3. sign an EIP-3009 authorization. The token's EIP-712 domain comes from
// the challenge's `extra`, which is the only place it is published.
const now = Math.floor(Date.now() / 1000)
const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}` as `0x${string}`
const authorization = {
  from: getAddress(account.address),
  to: getAddress(terms.payTo),
  value: BigInt(terms.maxAmountRequired),
  validAfter: BigInt(now - 60),                              // clock skew
  validBefore: BigInt(now + (terms.maxTimeoutSeconds || 300)),
  nonce,
}
const signature = await account.signTypedData({
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
  domain: {
    name: terms.extra?.name ?? 'USDC',
    version: terms.extra?.version ?? '2',
    chainId: celo.id,
    verifyingContract: getAddress(terms.asset),
  },
  primaryType: 'TransferWithAuthorization',
  message: authorization,
})

const payment = {
  x402Version: challenge.x402Version,
  scheme: terms.scheme,
  network: terms.network,
  payload: {
    signature,
    authorization: Object.fromEntries(
      Object.entries(authorization).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]),
    ),
  },
}
const header = Buffer.from(JSON.stringify(payment)).toString('base64')
console.log('X-PAYMENT  :', header.length, 'chars of base64')

if (DRY_RUN) {
  console.log('')
  console.log(JSON.stringify(payment, null, 2))
  console.log('')
  console.log('DRY RUN - nothing sent, no settlement spent.')
  process.exit(0)
}

// --- 4. pay. A 5xx here may mean the payment DID settle: x402 has no refund
// primitive and this must never be blindly retried.
console.log('')
console.log('==> paying (real money, single attempt, no retry)')
const paidRes = await fetch(RESOURCE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-PAYMENT': header },
  body: BODY,
})
const text = await paidRes.text()
console.log('status     :', paidRes.status)
const settle = paidRes.headers.get('x-payment-response')
if (settle) {
  try { console.log('settlement :', JSON.stringify(JSON.parse(Buffer.from(settle, 'base64').toString()), null, 2)) }
  catch { console.log('settlement :', settle) }
}
console.log('body       :', text.slice(0, 900))
if (paidRes.status >= 500) {
  console.log('')
  console.log('!! 5xx: the payment may ALREADY have settled. Do not re-run.')
  console.log('!! Check the payer balance and the payTo address before doing anything else.')
}
