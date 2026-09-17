import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAbiItem, getAddress, toEventSelector } from 'viem'
import { abi } from '../lib/contract.js'
import {
  OPERATOR_CHANGED_TOPIC, etherscanLogsUrl, fetchOperatorCandidates, operatorChangesFromExplorer, recoverAgent,
} from '../lib/agentDiscovery.js'
import { GET } from '../app/api/accounts/operators/route'

const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d'
const OWNER = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57' as const
const A = '0xd44daf6db6c8057c206e6acc27e6384b8ec850d6'
const B = '0x64ad61211c1b0b7f20b3e04b49661f30f152ae78'
const topic = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}`
const bool = (on: boolean) => `0x${'0'.repeat(63)}${on ? 1 : 0}`
const log = (operator: string, enabled: boolean, block: string, index = '0x') => ({
  address: ACCOUNT.toLowerCase(),
  topics: [OPERATOR_CHANGED_TOPIC, topic(operator)],
  data: bool(enabled),
  blockNumber: block,
  logIndex: index,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the OperatorChanged query', () => {
  // Against the compiled ABI, not the same string again: a renamed or
  // re-typed event in the contract has to break this.
  it('asks for the event the contract emits', () => {
    expect(OPERATOR_CHANGED_TOPIC).toBe(toEventSelector(getAbiItem({ abi, name: 'OperatorChanged' })))
  })

  it('asks Celo mainnet for the whole history of one account', () => {
    const url = new URL(etherscanLogsUrl(ACCOUNT, 'k', 2))
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      chainid: '42220', module: 'logs', action: 'getLogs', address: ACCOUNT,
      topic0: OPERATOR_CHANGED_TOPIC, fromBlock: '0', toBlock: 'latest', page: '2', offset: '1000', apikey: 'k',
    })
  })
})

describe('operatorChangesFromExplorer', () => {
  // The entry Etherscan returned for 0xBE380aa7 on 2026-09-17, trimmed.
  it('reads the measured response, where zero is written as a bare 0x', () => {
    expect(operatorChangesFromExplorer([log(A, true, '0x49bcbde')], ACCOUNT)).toEqual([
      { operator: getAddress(A), enabled: true, blockNumber: 0x49bcbden, logIndex: 0 },
    ])
  })

  it('reads a revocation', () => {
    expect(operatorChangesFromExplorer([log(A, false, '0x10', '0x3')], ACCOUNT)[0])
      .toMatchObject({ enabled: false, logIndex: 3 })
  })

  it('drops anything it cannot trust', () => {
    const good = log(A, true, '0x10')
    expect(operatorChangesFromExplorer([
      { ...good, address: B },
      { ...good, topics: ['0x' + '1'.repeat(64), topic(A)] },
      { ...good, topics: [OPERATOR_CHANGED_TOPIC, '0x1234'] },
      { ...good, data: '0x01' },
      { ...good, blockNumber: 'ten' },
      null,
      'x',
    ], ACCOUNT)).toEqual([])
    expect(operatorChangesFromExplorer('Invalid API Key', ACCOUNT)).toEqual([])
  })
})

describe('GET /api/accounts/operators', () => {
  const call = (account: string) => GET(new Request(`http://test/api/accounts/operators?account=${account}`))
  const explorer = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body))))

  it('refuses an invalid account', async () => {
    expect((await call('nope')).status).toBe(400)
  })

  it('says when the explorer is not configured', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', '')
    vi.stubEnv('CELOSCAN_KEY', '')
    const response = await call(ACCOUNT)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'DISCOVERY_NOT_CONFIGURED' })
  })

  it('returns live operators, newest authorisation first, without the revoked', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'k')
    explorer({ status: '1', message: 'OK', result: [
      log(A, true, '0x10'), log(B, true, '0x20'), log(A, false, '0x30'),
    ] })
    const response = await call(ACCOUNT)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ operators: [getAddress(B)] })
  })

  it('treats an empty history as an empty list', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'k')
    explorer({ status: '0', message: 'No records found', result: [] })
    expect(await (await call(ACCOUNT)).json()).toEqual({ operators: [] })
  })

  it('fails on an explorer error rather than answering none', async () => {
    vi.stubEnv('ETHERSCAN_API_KEY', 'k')
    explorer({ status: '0', message: 'NOTOK', result: 'Invalid API Key' })
    expect((await call(ACCOUNT)).status).toBe(502)
  })
})

describe('fetchOperatorCandidates', () => {
  it('returns the valid addresses the route named', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ operators: [getAddress(A), 'junk', 7] }))))
    expect(await fetchOperatorCandidates(ACCOUNT)).toEqual([getAddress(A)])
  })

  it('throws on a failed or malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 502 })))
    await expect(fetchOperatorCandidates(ACCOUNT)).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    await expect(fetchOperatorCandidates(ACCOUNT)).rejects.toThrow()
  })
})

describe('recoverAgent', () => {
  const a = getAddress(A)
  const b = getAddress(B)

  it('returns the first candidate operators() confirms, in candidate order', async () => {
    expect(await recoverAgent({
      owner: OWNER,
      candidates: async () => [a, b],
      isOperator: async (candidate) => candidate === b,
    })).toBe(b)
  })

  // One Promise.all, so viem multicalls the reads: every check starts before any finishes.
  it('asks about every candidate at once', async () => {
    const started: string[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const pending = recoverAgent({
      owner: OWNER,
      candidates: async () => [a, b],
      isOperator: async (candidate) => { started.push(candidate); await gate; return false },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(started).toEqual([a, b])
    release()
    expect(await pending).toBeNull()
  })

  // The wizard refuses the owner as its own agent; recovery must not hand it back.
  it('never offers the owner', async () => {
    expect(await recoverAgent({
      owner: OWNER.toLowerCase(),
      candidates: async () => [OWNER],
      isOperator: async () => true,
    })).toBeNull()
  })

  it('fails closed and quietly', async () => {
    expect(await recoverAgent({
      owner: OWNER, candidates: async () => { throw new Error('502') }, isOperator: async () => true,
    })).toBeNull()
    expect(await recoverAgent({
      owner: OWNER, candidates: async () => [a], isOperator: async () => { throw new Error('rpc') },
    })).toBeNull()
  })
})

describe('the wizard recovers its agent', () => {
  const ROOT = fileURLToPath(new URL('..', import.meta.url))
  const source = readFileSync(join(ROOT, 'app/setup/page.tsx'), 'utf8')
  const restore = source.slice(source.indexOf('// Local storage supplies candidates'), source.indexOf('async function deploy()'))

  it('asks the explorer only when the saved agent is missing or no longer authorised', () => {
    expect(restore).toContain('if (!knownAgent && !cancelled)')
    expect(restore).toContain('fetchOperatorCandidates(account)')
    expect(restore.indexOf('recoverAgent(')).toBeGreaterThan(restore.indexOf('const savedAgent'))
  })

  it('remembers what it recovered', () => {
    expect(restore).toContain('writeLocal(`leash.agent.${account.toLowerCase()}`, knownAgent)')
  })
})
