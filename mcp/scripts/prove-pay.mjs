#!/usr/bin/env node
/**
 * Proves `leash_pay`'s success outcome on mainnet, through the PUBLISHED
 * package, and checks it against the chain rather than against its own output.
 *
 * ⚠️ SPENDS REAL MONEY: 0.01 USDC plus about 0.0022 in gas. Guarded by an
 * environment variable for the same reason `examples/demo-agent.ts` is.
 *
 *   set -a && . ./.env && set +a && \
 *   LEASH_PROVE_SPEND_REAL_MONEY=yes pnpm -F leash-agentpay prove:pay 0.2.1
 *
 * What it establishes that no unit test can: that `ok: true` comes back only
 * after a receipt was actually read, and that the figures the tool reports
 * match what the chain holds AT THAT TRANSACTION'S OWN BLOCK. Reading at head
 * instead is the hazard that made the demo print a counter which had not moved
 * (docs/RESUME.md, 2026-09-05) — forno is load-balanced and serves stale reads
 * after a confirmed transaction, so a read taken "now" races the write and
 * proves nothing either way.
 *
 * The other two outcomes, `spend_reverted` and `sent_unconfirmed`, are NOT
 * proven here. Both need a chain that misbehaves on cue. Do not claim them.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicClient, http } from 'viem'
import { celo } from 'viem/chains'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

if (process.env.LEASH_PROVE_SPEND_REAL_MONEY !== 'yes') {
  console.error(
    'This spends real USDC on Celo mainnet.\n' +
    'Re-run with LEASH_PROVE_SPEND_REAL_MONEY=yes if that is what you want.',
  )
  process.exit(1)
}

const VERSION = process.argv[2] ?? '0.2.1'
const AMOUNT = '0.01'
const ATOMIC = 10_000n

const pub = createPublicClient({ chain: celo, transport: http(process.env.CELO_RPC_URL) })
const TOKEN = process.env.SPEND_TOKEN
const ACC = process.env.LEASH_ACCOUNT
const PAYEE = process.env.SPEND_PAYEE
for (const [k, v] of Object.entries({ SPEND_TOKEN: TOKEN, LEASH_ACCOUNT: ACC, SPEND_PAYEE: PAYEE })) {
  if (!v) throw new Error(`${k} is not set; source .env first`)
}

const erc20 = [{
  name: 'balanceOf', type: 'function', stateMutability: 'view',
  inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }],
}]
const remAbi = [{
  name: 'remainingToday', type: 'function', stateMutability: 'view',
  inputs: [{ name: 't', type: 'address' }], outputs: [{ type: 'uint256' }],
}]

/** Every read pinned to one block, so the three figures describe one moment. */
const read = async (blockNumber) => {
  const at = blockNumber === undefined ? {} : { blockNumber }
  return {
    remaining: await pub.readContract({
      address: ACC, abi: remAbi, functionName: 'remainingToday', args: [TOKEN], ...at,
    }),
    account: await pub.readContract({
      address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [ACC], ...at,
    }),
    payee: await pub.readContract({
      address: TOKEN, abi: erc20, functionName: 'balanceOf', args: [PAYEE], ...at,
    }),
  }
}

const dir = mkdtempSync(join(tmpdir(), 'leash-prove-'))
execFileSync('npm', ['install', '--silent', `leash-agentpay@${VERSION}`], { cwd: dir })
const binDir = join(dir, 'node_modules', '.bin')

const before = await read()
console.log(`BEFORE  remaining ${before.remaining}  account ${before.account}  payee ${before.payee}`)

const need = ['LEASH_ACCOUNT', 'OPERATOR_PK', 'ATTRIBUTION_TAG', 'SPEND_TOKEN', 'FEE_ADAPTER', 'CELO_RPC_URL']
const env = Object.fromEntries(need.filter((k) => process.env[k]).map((k) => [k, process.env[k]]))

const client = new Client({ name: 'prove-pay', version: '0' }, { capabilities: {} })
await client.connect(new StdioClientTransport({
  command: 'leash-agentpay',
  env: { PATH: `${binDir}:${process.env.PATH}`, ...env },
}))

const t = Date.now()
let out
try {
  out = JSON.parse((await client.callTool({
    name: 'leash_pay', arguments: { to: PAYEE, amount: AMOUNT },
  })).content[0].text)
} finally {
  await client.close()
  rmSync(dir, { recursive: true, force: true })
}

const waited = ((Date.now() - t) / 1000).toFixed(1)
console.log(`\nleash_pay returned after ${waited}s (it waited for the chain):`)
console.log(JSON.stringify(out, null, 2))

if (!out.transaction) {
  console.log('\nNo transaction hash, so there is nothing to check against the chain.')
  process.exit(1)
}

const receipt = await pub.getTransactionReceipt({ hash: out.transaction })
const after = await read(receipt.blockNumber)
console.log(`\nreceipt.status = ${receipt.status}   block ${receipt.blockNumber}`)
console.log(`AFTER   remaining ${after.remaining}  account ${after.account}  payee ${after.payee}`)

const checks = [
  ['the tool reported ok', out.ok === true],
  ['the receipt says the transaction succeeded', receipt.status === 'success'],
  [`the allowance fell by exactly ${ATOMIC}`, before.remaining - after.remaining === ATOMIC],
  [`the account fell by exactly ${ATOMIC}`, before.account - after.account === ATOMIC],
  [`the payee rose by exactly ${ATOMIC}`, after.payee - before.payee === ATOMIC],
]
console.log()
for (const [what, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'}  ${what}`)
console.log(`\ntx: ${out.transaction}`)
process.exit(checks.every(([, pass]) => pass) ? 0 : 1)
