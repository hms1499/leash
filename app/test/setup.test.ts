import { describe, expect, it } from 'vitest'
import {
  afterFailedRead, balanceValue, describeBalance, firstSetupStage, setupReadiness,
} from '../lib/setup.js'

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

describe('balance reads', () => {
  it('yields a value only from a completed read', () => {
    expect(balanceValue({ status: 'ok', value: 5_000_000n })).toBe(5_000_000n)
    expect(balanceValue({ status: 'reading' })).toBeNull()
    expect(balanceValue({ status: 'failed' })).toBeNull()
  })

  it('keeps a failed read out of readiness, exactly as an unread one is', () => {
    const base = {
      account: '0x0000000000000000000000000000000000000001',
      limitsConfirmed: true,
      agentAuthorized: true,
      agentTransactionsLeft: 3,
    }
    expect(setupReadiness({ ...base, protectedBalance: balanceValue({ status: 'failed' }) }).ready)
      .toBe(false)
    expect(setupReadiness({ ...base, protectedBalance: balanceValue({ status: 'reading' }) }).ready)
      .toBe(false)
    expect(setupReadiness({ ...base, protectedBalance: balanceValue({ status: 'ok', value: 1n }) }).ready)
      .toBe(true)
  })

  /**
   * The defect this replaced: `null` meant both "not read yet" and "the read
   * threw", so a failed balance read rendered "Checking…" for ever, with
   * "Review setup" disabled and nothing on screen saying why.
   */
  it('says a read failed rather than pretending it is still running', () => {
    expect(describeBalance({ status: 'reading' }, 6)).toEqual({ text: 'Checking…', failed: false })
    expect(describeBalance({ status: 'failed' }, 6)).toEqual({ text: 'Could not read', failed: true })
  })

  it('formats a balance without the trailing zeroes formatAmount would pad', () => {
    expect(describeBalance({ status: 'ok', value: 5_000_000n }, 6).text).toBe('5.00 USDC')
    expect(describeBalance({ status: 'ok', value: 190_000n }, 6).text).toBe('0.19 USDC')
    // Small figures survive: the agent gas float is the whole reason this
    // column exists, and 0.05 must not round to nothing.
    expect(describeBalance({ status: 'ok', value: 46_000n }, 6).text).toBe('0.046 USDC')
  })

  /**
   * `useAccountState` keeps the last observed snapshot visible across a failed
   * refresh rather than blanking it, and this column must not disagree: a
   * transient forno failure should not erase a figure the chain already gave.
   */
  it('does not erase an observed balance when a later read fails', () => {
    expect(afterFailedRead({ status: 'ok', value: 5_000_000n })).toEqual({ status: 'ok', value: 5_000_000n })
    expect(afterFailedRead({ status: 'reading' })).toEqual({ status: 'failed' })
    expect(afterFailedRead({ status: 'failed' })).toEqual({ status: 'failed' })
  })
})
