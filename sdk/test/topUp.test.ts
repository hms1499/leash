import { describe, it, expect } from 'vitest'
import { decodeFunctionData } from 'viem'
import { spendPolicyAccountAbi } from '../src/index.js'
import { buildTopUpCalldata, buildSpendCalldata } from '../src/policyClient.js'

const TOKEN = '0xcebA9300f2b948710d2653dD7B07f33A8B32118C' as const
const PAYEE = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57' as const
const TAG = 'celo_3dec652cd977'
const MARKER = '80218021802180218021802180218021'

describe('buildTopUpCalldata', () => {
  it('calls topUpOperator, not execute — the payee allowlist cannot apply here', () => {
    const data = buildTopUpCalldata(TOKEN, 16753n, TAG)
    const decoded = decodeFunctionData({
      abi: spendPolicyAccountAbi,
      data: data.slice(0, 138) as `0x${string}`,
    })
    expect(decoded.functionName).toBe('topUpOperator')
    expect(decoded.args).toEqual([TOKEN, 16753n])
  })

  it('tags the draw like every other outbound transaction', () => {
    expect(buildTopUpCalldata(TOKEN, 16753n, TAG).endsWith(MARKER)).toBe(true)
  })

  it('tags exactly once, so a retry can never double-tag', () => {
    const data = buildTopUpCalldata(TOKEN, 16753n, TAG)
    expect((data.match(new RegExp(MARKER, 'g')) ?? []).length).toBe(1)
  })

  it('builds fresh bytes per call rather than mutating a cached buffer', () => {
    expect(buildTopUpCalldata(TOKEN, 1n, TAG)).not.toBe(buildTopUpCalldata(TOKEN, 2n, TAG))
  })
})

describe('buildSpendCalldata', () => {
  // Extracted alongside buildTopUpCalldata so both spend paths are built the
  // same way; this test exists so the extraction cannot silently change execute.
  it('still encodes execute with the payee', () => {
    const data = buildSpendCalldata(TOKEN, PAYEE, 250_000n, TAG)
    const decoded = decodeFunctionData({
      abi: spendPolicyAccountAbi,
      data: data.slice(0, 202) as `0x${string}`,
    })
    expect(decoded.functionName).toBe('execute')
    expect(decoded.args).toEqual([TOKEN, PAYEE, 250_000n])
    expect(data.endsWith(MARKER)).toBe(true)
  })
})
