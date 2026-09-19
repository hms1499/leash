import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LEASH_DATA_SUFFIX } from '@leash/sdk'
import { celo } from 'viem/chains'
import { http } from 'viem'
import { createConfig, injected } from 'wagmi'
import { connect, deployContract, writeContract } from 'wagmi/actions'

/**
 * Celo Builders counts a signer only from transactions carrying this
 * project's ERC-8021 code, and a code cannot be added to a transaction after
 * it is mined. Until 2026-09-19 only the operator's spends carried it, through
 * the SDK. Every transaction an owner signed in this app -- deploying the
 * account, setting its limits, funding it, the kill switch -- went out bare,
 * so the people using Leash through its own dashboard were never counted as
 * its users, on any track.
 *
 * That it decodes to the registered code is asserted in the SDK, which owns
 * the library. What is pinned here is the bytes: these 35 are the ones
 * contracts/test/AttributionSuffix.t.sol appends to a deployment and to an
 * owner write, and proves change nothing the contract does.
 */
describe('LEASH_DATA_SUFFIX', () => {
  it('is the suffix the contract tests proved harmless', () => {
    expect(LEASH_DATA_SUFFIX).toBe(
      '0x63656c6f5f336465633635326364393737110080218021802180218021802180218021',
    )
  })
})

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** The object literal a write is called with, from its `{` to the matching `}`. */
function argumentOf(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1)
  }
  throw new Error('unbalanced braces')
}

/**
 * Asserted against the source, like the multicall and v1-read checks in
 * chain.test.ts, because the failure is silent in the same way: a write
 * without the suffix lands, costs no test and no type error, and quietly
 * stops counting whoever signed it. wagmi's connector client is built without
 * viem's client-level `dataSuffix`, so there is no one place to set it -- it
 * has to be on each call, the same way `chainId` is.
 */
describe('every write the app signs', () => {
  const WRITE = /\b(?:writeContract|deployContract|sendTransaction)(?:Async)?\(\{/g
  const sites = ['app', 'components', 'lib'].flatMap((dir) =>
    sources(join(ROOT, dir)).flatMap((file) => {
      const src = readFileSync(file, 'utf8')
      return [...src.matchAll(WRITE)].map((m) => ({
        where: `${relative(ROOT, file)}:${src.slice(0, m.index).split('\n').length}`,
        call: m[0],
        argument: argumentOf(src, m.index! + m[0].length - 1),
      }))
    }),
  )

  it('finds the writes, so the check below cannot pass on nothing', () => {
    // The deployment is the one that matters most: it is the first
    // transaction a new owner ever signs here.
    expect(sites.some((s) => s.call.startsWith('deployContract'))).toBe(true)
    expect(sites.some((s) => s.call.startsWith('writeContract'))).toBe(true)
  })

  it('carries the attribution suffix', () => {
    const bare = sites
      .filter((s) => !/\bdataSuffix: LEASH_DATA_SUFFIX\b/.test(s.argument))
      .map((s) => s.where)
    expect(bare).toEqual([])
  })
})

/**
 * The source check above proves each call asks for the suffix. This proves
 * the wallet receives it: wagmi's actions spread their parameters into viem's,
 * and viem appends `dataSuffix` in sendTransaction, but a wagmi or viem
 * upgrade that stopped forwarding it would still type-check and would still
 * pass every line of the check above.
 *
 * The provider is fake and answers only what a browser wallet is asked, so
 * nothing here touches a network.
 */
describe('the suffix reaches the wallet', () => {
  // wagmi's injected connector finds no provider without a window, and it is
  // the connector the app uses, so the test stands one up rather than swap it.
  beforeAll(() => { vi.stubGlobal('window', new EventTarget()) })
  afterAll(() => { vi.unstubAllGlobals() })

  const OWNER = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'
  const ACCOUNT = '0xBE380aa73c036da30D3b2fd5E75B0d1d89E11C3d'
  const PAUSE_ABI = [{
    type: 'function', name: 'setPaused', stateMutability: 'nonpayable',
    inputs: [{ name: '_paused', type: 'bool' }], outputs: [],
  }] as const
  const CTOR_ABI = [{
    type: 'constructor', stateMutability: 'nonpayable',
    inputs: [{ name: '_owner', type: 'address' }],
  }] as const

  async function signedData(send: (config: ReturnType<typeof createConfig>) => Promise<unknown>) {
    let data: string | undefined
    const provider = {
      on() {}, removeListener() {},
      async request({ method, params }: { method: string; params?: unknown[] }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [OWNER]
        if (method === 'eth_chainId') return `0x${celo.id.toString(16)}`
        if (method === 'eth_sendTransaction') {
          data = (params![0] as { data: string }).data
          return `0x${'ab'.repeat(32)}`
        }
        throw new Error(`fake wallet was not expecting ${method}`)
      },
    }
    const config = createConfig({
      chains: [celo],
      connectors: [injected({ target: () => ({ id: 'fake', name: 'Fake', provider: provider as never }) })],
      transports: { [celo.id]: http('http://127.0.0.1:1') },
    })
    await connect(config, { connector: config.connectors[0]! })
    await send(config)
    return data
  }

  it('on a contract write', async () => {
    const data = await signedData((config) => writeContract(config, {
      address: ACCOUNT, abi: PAUSE_ABI, functionName: 'setPaused', args: [true],
      chainId: celo.id, gas: 100_000n, dataSuffix: LEASH_DATA_SUFFIX,
    }))
    expect(data?.endsWith(LEASH_DATA_SUFFIX.slice(2))).toBe(true)
  })

  it('on the deployment, after the constructor argument', async () => {
    const data = await signedData((config) => deployContract(config, {
      abi: CTOR_ABI, bytecode: '0x6080', args: [OWNER],
      chainId: celo.id, gas: 1_400_000n, dataSuffix: LEASH_DATA_SUFFIX,
    }))
    const owner = OWNER.slice(2).toLowerCase().padStart(64, '0')
    expect(data).toBe(`0x6080${owner}${LEASH_DATA_SUFFIX.slice(2)}`)
  })
})
