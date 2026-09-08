import { describe, expect, it } from 'vitest'
import { firstSetupStage, setupReadiness } from '../lib/setup.js'

describe('setupReadiness', () => {
  const complete = {
    account: '0x0000000000000000000000000000000000000001',
    limitsConfirmed: true,
    agentAuthorized: true,
    protectedBalance: 5_000_000n,
    agentTransactionsLeft: 3,
  }

  it('is ready only when the agent can actually transact', () => {
    expect(setupReadiness(complete).ready).toBe(true)
  })

  it('does not mistake a funded policy account for a ready agent', () => {
    const readiness = setupReadiness({ ...complete, agentTransactionsLeft: 0 })
    expect(readiness.ready).toBe(false)
    expect(readiness.agentGasReady).toBe(false)
    expect(firstSetupStage(readiness)).toBe(3)
  })

  it('does not require MCP or an attribution tag', () => {
    expect(Object.keys(setupReadiness(complete))).toEqual([
      'accountCreated',
      'limitsConfirmed',
      'agentAuthorized',
      'protectedFundsDetected',
      'agentGasReady',
      'ready',
    ])
  })

  it('returns the first incomplete stage when setup is resumed', () => {
    expect(firstSetupStage(setupReadiness({
      ...complete,
      limitsConfirmed: false,
      agentAuthorized: false,
      protectedBalance: 0n,
      agentTransactionsLeft: 0,
    }))).toBe(2)
  })
})
