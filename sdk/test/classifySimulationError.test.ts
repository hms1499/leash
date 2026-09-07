import { describe, it, expect } from 'vitest'
import {
  encodeErrorResult, ContractFunctionRevertedError, HttpRequestError, TimeoutError,
} from 'viem'
import { spendPolicyAccountAbi } from '../src/abi.js'
import { classifySimulationError } from '../src/policyClient.js'

/**
 * The real thing viem hands back, not a hand-shaped lookalike: the revert is
 * encoded from the contract's own ABI and decoded by viem's own constructor,
 * so a change to either fails here rather than reaching an agent.
 */
function reverted(errorName: string, args: readonly unknown[]) {
  const cause = new ContractFunctionRevertedError({
    abi: spendPolicyAccountAbi,
    functionName: 'execute',
    data: encodeErrorResult({ abi: spendPolicyAccountAbi, errorName, args } as never),
  })
  return Object.assign(new Error('execution reverted'), { cause })
}

describe('classifySimulationError', () => {
  it('decodes a policy revert into the refusal it names', () => {
    const out = classifySimulationError(reverted('PerTxCapExceeded', [900_000n, 500_000n]))
    expect(out).toEqual({ ok: false, error: 'per_tx_cap_exceeded', spent: 0n, cap: 500_000n })
  })

  it('decodes the kill switch', () => {
    const out = classifySimulationError(reverted('ContractPaused', []))
    if (out.ok) throw new Error('unreachable')
    expect(out.error).toBe('account_paused')
  })

  // The chain answered and refused; we simply cannot name the revert. That is
  // still a refusal, and must not be reported as an unreadable chain.
  it('calls an undecodable revert a refusal, because the chain did answer', () => {
    const cause = new ContractFunctionRevertedError({
      abi: spendPolicyAccountAbi, functionName: 'execute', message: 'reverted: something else',
    })
    const out = classifySimulationError(Object.assign(new Error('reverted'), { cause }))
    if (out.ok) throw new Error('unreachable')
    expect(out.error).toBe('unknown_policy_error')
  })

  // The bug this exists for. forno 500s and times out routinely; reporting
  // that as `unknown_policy_error` told an agent "the on-chain policy refused
  // a payment" about a policy that was never asked.
  it('does not call an unreachable node a policy refusal', () => {
    const cause = new HttpRequestError({ url: 'https://forno.celo.org', status: 500 })
    const out = classifySimulationError(Object.assign(new Error('http'), { cause }))
    if (out.ok) throw new Error('unreachable')
    expect(out.error).toBe('policy_unreadable')
  })

  it('does not call a timeout a policy refusal', () => {
    const cause = new TimeoutError({ body: {}, url: 'https://forno.celo.org' })
    const out = classifySimulationError(Object.assign(new Error('timeout'), { cause }))
    if (out.ok) throw new Error('unreachable')
    expect(out.error).toBe('policy_unreadable')
  })

  it('does not call an error with no cause at all a policy refusal', () => {
    const out = classifySimulationError(new Error('fetch failed'))
    if (out.ok) throw new Error('unreachable')
    expect(out.error).toBe('policy_unreadable')
  })
})
