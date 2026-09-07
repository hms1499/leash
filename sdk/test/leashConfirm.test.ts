import { describe, it, expect, vi, afterEach } from 'vitest'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { LeashClient } from '../src/policyClient.js'

const ACCOUNT = '0x7aDa926B021BAef4896F51F237bCA61435E43fd2' as const
// Fabricated, not a mainnet hash: every receipt below is invented, and a real
// hash here would imply this test says something about a real transaction.
const HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`

function client() {
  return new LeashClient({
    account: privateKeyToAccount(generatePrivateKey()),
    accountAddress: ACCOUNT,
    attributionTag: 'celo_3dec652cd977',
    rpcUrl: 'http://leash.test/rpc',
  })
}

/**
 * A receipt as a Celo node actually returns it, driven through viem's real
 * transport and formatter. The point is to pin the one assumption the whole
 * confirmation path rests on: that viem turns the JSON-RPC `status` field
 * "0x1"/"0x0" into the strings 'success'/'reverted'. Asserting that against a
 * hand-built object would prove nothing.
 */
function receipt(statusHex: '0x1' | '0x0') {
  return {
    transactionHash: HASH, transactionIndex: '0x0', blockNumber: '0x1',
    blockHash: '0x' + '11'.repeat(32), from: ACCOUNT, to: ACCOUNT,
    cumulativeGasUsed: '0x1', gasUsed: '0x1', effectiveGasPrice: '0x1',
    contractAddress: null, logs: [], logsBloom: '0x' + '00'.repeat(256),
    status: statusHex, type: '0x2',
  }
}

function rpc(result: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

afterEach(() => vi.restoreAllMocks())

describe('LeashClient.confirm', () => {
  it('reads a mined, succeeded transaction as success', async () => {
    rpc(receipt('0x1'))
    await expect(client().confirm(HASH, { attempts: 2, intervalMs: 0 })).resolves.toBe('success')
  })

  // The hazard CLAUDE.md names: waitForTransactionReceipt resolves on revert.
  // A reverted spend moved no money and must never be reported as a payment.
  it('reads a mined, reverted transaction as reverted', async () => {
    rpc(receipt('0x0'))
    await expect(client().confirm(HASH, { attempts: 2, intervalMs: 0 })).resolves.toBe('reverted')
  })

  // A pending transaction has no receipt; viem throws for it. Running out of
  // attempts is "we stopped waiting", never "it failed".
  it('reads a transaction that never appears as unobserved', async () => {
    rpc(null)
    await expect(client().confirm(HASH, { attempts: 2, intervalMs: 0 })).resolves.toBe('unobserved')
  })

  it('does not throw when the node is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(client().confirm(HASH, { attempts: 2, intervalMs: 0 })).resolves.toBe('unobserved')
  })
})
