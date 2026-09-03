import { describe, it, expect } from 'vitest'
import { describeLog } from '../lib/feed.js'

const TX = ('0x' + 'ab'.repeat(32)) as `0x${string}`
const PAYEE = '0x2B33cb68c4D826a4Fc36264bcDB46081c99f4f57'

describe('describeLog', () => {
  it('renders a spend with its payee', () => {
    const row = describeLog({
      eventName: 'Spent',
      args: { token: PAYEE, to: PAYEE, amount: 10_000n, operator: PAYEE },
      transactionHash: TX,
      blockNumber: 100n,
    })
    expect(row.kind).toBe('spent')
    expect(row.text).toBe('Spent to 0x2B33…4f57')
    expect(row.amount).toBe(10_000n)
  })

  it('renders a top-up as money leaving the policy, not a payment', () => {
    const row = describeLog({
      eventName: 'ToppedUp',
      args: { token: PAYEE, operator: PAYEE, amount: 9_300n },
      transactionHash: TX,
      blockNumber: 101n,
    })
    expect(row.kind).toBe('toppedUp')
    expect(row.text).toBe('Topped up the agent wallet')
    expect(row.amount).toBe(9_300n)
  })

  it('renders a policy change with no amount column', () => {
    const row = describeLog({
      eventName: 'PolicyChanged',
      args: { token: PAYEE, perTx: 500_000n, daily: 1_000_000n },
      transactionHash: TX,
      blockNumber: 102n,
    })
    expect(row.kind).toBe('policy')
    expect(row.amount).toBeNull()
  })

  it('distinguishes pausing from resuming', () => {
    expect(describeLog({
      eventName: 'PausedSet', args: { paused: true },
      transactionHash: TX, blockNumber: 103n,
    }).kind).toBe('paused')

    expect(describeLog({
      eventName: 'PausedSet', args: { paused: false },
      transactionHash: TX, blockNumber: 104n,
    }).kind).toBe('unpaused')
  })
})
