import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TransactionNotFoundError, TransactionReceiptNotFoundError } from 'viem'
import {
  checkPendingDeploy, parsePendingDeploy, pendingDeployBlocksCreate, pendingDeployKey,
  pendingDeployNote, serializePendingDeploy, type PendingDeployClient,
} from '../lib/pendingDeploy.js'

const OWNER = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
const OTHER = '0x64Ad61211C1b0B7f20B3e04B49661f30f152ae78'
const HASH = `0x${'ab'.repeat(32)}` as `0x${string}`
const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d' as const

/** Defaults to "Celo has never heard of it"; each test overrides what it needs. */
function client(over: Partial<PendingDeployClient> = {}): PendingDeployClient {
  return {
    getTransactionReceipt: async () => { throw new TransactionReceiptNotFoundError({ hash: HASH }) },
    getTransaction: async () => { throw new TransactionNotFoundError({ hash: HASH }) },
    ...over,
  }
}

describe('the pending deploy record', () => {
  it('is keyed by owner, whatever the casing', () => {
    expect(pendingDeployKey(OWNER)).toBe(`leash.pendingDeploy.${OWNER.toLowerCase()}`)
  })

  it('round-trips', () => {
    const record = { hash: HASH, owner: OWNER, sentAt: 1 }
    expect(parsePendingDeploy(serializePendingDeploy(record), OWNER.toLowerCase())).toEqual(record)
  })

  it('refuses anything it did not write for this owner', () => {
    expect(parsePendingDeploy(null, OWNER)).toBeNull()
    expect(parsePendingDeploy('not json', OWNER)).toBeNull()
    expect(parsePendingDeploy(JSON.stringify({ hash: '0x12', owner: OWNER, sentAt: 1 }), OWNER)).toBeNull()
    expect(parsePendingDeploy(JSON.stringify({ hash: HASH, owner: OTHER, sentAt: 1 }), OWNER)).toBeNull()
    expect(parsePendingDeploy(JSON.stringify({ hash: HASH, owner: OWNER }), OWNER)).toBeNull()
  })
})

describe('checkPendingDeploy', () => {
  it('reports a landed deployment with its address and block', async () => {
    const check = await checkPendingDeploy(HASH, client({
      getTransactionReceipt: async () => ({ status: 'success', contractAddress: ACCOUNT, blockNumber: 123n }),
    }))
    expect(check).toEqual({ kind: 'landed', address: ACCOUNT, deployBlock: '123' })
  })

  // A receipt is not a success: describeDeployReceipt decides, as deploy() does.
  it('reports a reverted deployment as failed, in describeDeployReceipt words', async () => {
    const check = await checkPendingDeploy(HASH, client({
      getTransactionReceipt: async () => ({ status: 'reverted', contractAddress: ACCOUNT, blockNumber: 5n }),
    }))
    expect(check.kind).toBe('failed')
    expect(check.kind === 'failed' && check.message).toContain('reverted')
  })

  it('is waiting when the node knows the transaction but has no receipt', async () => {
    const check = await checkPendingDeploy(HASH, client({ getTransaction: async () => ({}) }))
    expect(check).toEqual({ kind: 'waiting' })
  })

  it('is unknown when the node knows neither', async () => {
    expect(await checkPendingDeploy(HASH, client())).toEqual({ kind: 'unknown' })
  })

  // An unreachable node is not evidence about the transaction either way.
  it('is unread on any other failure', async () => {
    expect(await checkPendingDeploy(HASH, client({
      getTransactionReceipt: async () => { throw new Error('fetch failed') },
    }))).toEqual({ kind: 'unread' })
    expect(await checkPendingDeploy(HASH, client({
      getTransaction: async () => { throw new Error('fetch failed') },
    }))).toEqual({ kind: 'unread' })
  })

  it('recognises a not-found error wrapped in a cause', async () => {
    const check = await checkPendingDeploy(HASH, client({
      getTransactionReceipt: async () => {
        throw Object.assign(new Error('wrapped'), { cause: new TransactionReceiptNotFoundError({ hash: HASH }) })
      },
      getTransaction: async () => ({}),
    }))
    expect(check).toEqual({ kind: 'waiting' })
  })
})

describe('what the wizard says and allows', () => {
  it('names the transaction in every unresolved state', () => {
    for (const check of ['checking', { kind: 'waiting' }, { kind: 'unknown' }, { kind: 'unread' }] as const) {
      expect(pendingDeployNote(check, HASH)).toContain(HASH)
    }
  })

  it('has nothing to say once it landed, and passes a failure through', () => {
    expect(pendingDeployNote({ kind: 'landed', address: ACCOUNT, deployBlock: '1' }, HASH)).toBeNull()
    expect(pendingDeployNote({ kind: 'failed', message: 'boom' }, HASH)).toBe('boom')
  })

  // A second press is a second fee: every state short of an answer blocks it.
  it('blocks Create until the chain has answered', () => {
    expect(pendingDeployBlocksCreate('checking')).toBe(true)
    expect(pendingDeployBlocksCreate({ kind: 'waiting' })).toBe(true)
    expect(pendingDeployBlocksCreate({ kind: 'unread' })).toBe(true)
    expect(pendingDeployBlocksCreate({ kind: 'unknown' })).toBe(true)
    expect(pendingDeployBlocksCreate({ kind: 'failed', message: 'x' })).toBe(false)
    expect(pendingDeployBlocksCreate({ kind: 'landed', address: ACCOUNT, deployBlock: '1' })).toBe(false)
  })
})

describe('the wizard remembers what it sent', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')
  const deploy = source.slice(source.indexOf('async function deploy()'), source.indexOf('async function setLimits()'))

  it('records the hash before waiting for the receipt', () => {
    const at = deploy.indexOf('writeLocal(pendingDeployKey(owner)')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(deploy.indexOf('waitForTransactionReceipt'))
  })

  it('forgets it once the receipt has been judged, either way', () => {
    const at = deploy.indexOf('removeLocal(pendingDeployKey(owner))')
    expect(at).toBeGreaterThan(deploy.indexOf('describeDeployReceipt(receipt, hash)'))
    expect(at).toBeLessThan(deploy.indexOf('if (!outcome.ok)'))
  })

  it('checks a remembered deployment when a wallet connects', () => {
    expect(source).toContain('parsePendingDeploy(readLocal(pendingDeployKey(connected)), connected)')
  })

  it('does not offer Create while one is unresolved', () => {
    const create = source.slice(source.indexOf('onClick={() => void deploy()}') - 300, source.indexOf('onClick={() => void deploy()}'))
    expect(create).toContain('pendingDeployBlocksCreate(pendingDeploy.check)')
  })

  it('lets the owner past a deployment Celo does not know, in two beats', () => {
    expect(source).toContain('It never landed — deploy again')
    expect(source).toContain('abandonArmed ? abandonPendingDeploy(')
  })
})
